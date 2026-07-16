import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/**
 * Public webhook endpoint for partner order intake.
 *
 * Auth: HMAC-SHA256 of the raw request body, hex-encoded, in `x-signature`
 * header. Shared secret is `PARTNER_WEBHOOK_SECRET`.
 *
 * Idempotent on `externalOrderId`: replaying the same order returns 200 with
 * the existing pending_order id and does not duplicate rows. The full raw
 * payload is stored on every accepted request for audit.
 */

const payloadSchema = z.object({
  externalOrderId: z.string().min(1).max(128),
  customer: z.object({
    id: z.string().max(128).optional().nullable(),
    name: z.string().max(255).optional().nullable(),
    email: z.string().max(255).optional().nullable(),
    company: z.string().max(255).optional().nullable(),
  }).optional().default({}),
  orderDate: z.string().max(64).optional().nullable(),
  shipping: z.object({
    trackingNumber: z.string().max(128).optional().nullable(),
    carrier: z.string().max(64).optional().nullable(),
    expectedArrival: z.string().max(32).optional().nullable(),
  }).optional().default({}),
  samples: z.array(z.object({
    sampleId: z.string().max(128).optional().nullable(),
    productName: z.string().min(1).max(255),
    quantity: z.number().int().min(1).max(9999).optional().default(1),
    lotBatch: z.string().max(128).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })).min(1).max(500),
  totalSamples: z.number().int().optional().nullable(),
  specialInstructions: z.string().max(4000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  try {
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

type SecretCandidate = { id: string | null; secret: string; source: "db" | "env" };

async function loadCandidateSecrets(): Promise<SecretCandidate[]> {
  const out: SecretCandidate[] = [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .select("id, secret, status, grace_until")
      .in("status", ["active", "deprecated"]);
    const now = Date.now();
    for (const r of data ?? []) {
      if (r.status === "active") {
        out.push({ id: r.id as string, secret: r.secret as string, source: "db" });
      } else if (r.status === "deprecated" && r.grace_until && new Date(r.grace_until as string).getTime() > now) {
        out.push({ id: r.id as string, secret: r.secret as string, source: "db" });
      }
    }
  } catch (e) {
    console.error("[orders/intake] failed loading DB secrets", e);
  }
  const envSecret = process.env.PARTNER_WEBHOOK_SECRET;
  if (envSecret) out.push({ id: null, secret: envSecret, source: "env" });
  return out;
}

function toDateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toIsoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export const Route = createFileRoute("/api/public/orders/intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-signature");

        const candidates = await loadCandidateSecrets();
        if (candidates.length === 0) {
          console.error("[orders/intake] no partner webhook secret configured (DB or env)");
          return new Response("Server not configured", { status: 500 });
        }
        const matched = candidates.find((c) => verifySignature(body, signature, c.secret));
        if (!matched) {
          return new Response("Invalid signature", { status: 401 });
        }
        // Best-effort last_verified_at update; ignore failures.
        if (matched.id) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin
              .from("partner_webhook_secrets")
              .update({ last_verified_at: new Date().toISOString() })
              .eq("id", matched.id);
          } catch (e) {
            console.error("[orders/intake] last_verified_at update failed", e);
          }
        }

        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const parsed = payloadSchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 10) },
            { status: 400 },
          );
        }
        const p = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: if this externalOrderId already exists, return it as-is.
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("pending_orders").select("id, status")
          .eq("external_order_id", p.externalOrderId).maybeSingle();
        if (existingErr) {
          console.error("[orders/intake] existing lookup failed", existingErr);
          return new Response("Server error", { status: 500 });
        }
        if (existing) {
          return Response.json({ ok: true, pendingOrderId: existing.id, duplicate: true });
        }

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("pending_orders")
          .insert({
            external_order_id: p.externalOrderId,
            status: "pending",
            order_date: toIsoOrNull(p.orderDate),
            customer_name: p.customer?.name ?? null,
            customer_email: p.customer?.email ?? null,
            customer_company: p.customer?.company ?? null,
            customer_external_id: p.customer?.id ?? null,
            tracking_number: p.shipping?.trackingNumber ?? null,
            carrier: p.shipping?.carrier ?? null,
            expected_arrival: toDateOnly(p.shipping?.expectedArrival),
            total_samples: p.totalSamples ?? p.samples.length,
            special_instructions: p.specialInstructions ?? null,
            raw_payload: json as never,
          })
          .select("id").single();
        if (insErr || !inserted) {
          console.error("[orders/intake] insert failed", insErr);
          return new Response("Server error", { status: 500 });
        }

        const sampleRows = p.samples.map((s, i) => ({
          pending_order_id: inserted.id,
          line_index: i,
          external_sample_id: s.sampleId ?? null,
          product_name: s.productName,
          quantity: s.quantity ?? 1,
          lot_batch: s.lotBatch ?? null,
          notes: s.notes ?? null,
        }));
        const { error: sErr } = await supabaseAdmin
          .from("pending_order_samples").insert(sampleRows);
        if (sErr) {
          console.error("[orders/intake] sample insert failed", sErr);
          // Best-effort cleanup so a retry can proceed cleanly.
          await supabaseAdmin.from("pending_orders").delete().eq("id", inserted.id);
          return new Response("Server error", { status: 500 });
        }

        return Response.json({ ok: true, pendingOrderId: inserted.id, duplicate: false });
      },
    },
  },
});
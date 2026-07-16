import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only server fns to view and rotate the partner webhook signing secret.
 * Plaintext secrets live in `partner_webhook_secrets.secret`; RLS restricts the
 * table to admins. The webhook route reads active + in-grace secrets via
 * supabaseAdmin when verifying HMAC signatures.
 */

type Status = "active" | "deprecated" | "revoked";

function makePreview(secret: string) {
  if (secret.length <= 10) return secret.slice(0, 2) + "…";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

function makeSecret(bytes = 48) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

type PublicRow = {
  id: string;
  secret_preview: string;
  status: Status;
  created_at: string;
  deprecated_at: string | null;
  grace_until: string | null;
  last_verified_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
};

export const getPartnerWebhookSecretStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .select("id, secret_preview, status, created_at, deprecated_at, grace_until, last_verified_at, created_by")
      .in("status", ["active", "deprecated"])
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Grace expiry cleanup: mark expired deprecated rows as revoked lazily.
    const now = Date.now();
    const expiredIds = (rows ?? [])
      .filter((r) => r.status === "deprecated" && r.grace_until && new Date(r.grace_until).getTime() < now)
      .map((r) => r.id);
    if (expiredIds.length) {
      await supabaseAdmin.from("partner_webhook_secrets").update({ status: "revoked" }).in("id", expiredIds);
    }

    const live = (rows ?? []).filter((r) => !expiredIds.includes(r.id));

    // Resolve creator names
    const creatorIds = Array.from(new Set(live.map((r) => r.created_by).filter((x): x is string => !!x)));
    let nameMap = new Map<string, string>();
    if (creatorIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds);
      nameMap = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string) || ""]));
    }

    const out: PublicRow[] = live.map((r) => ({
      id: r.id as string,
      secret_preview: r.secret_preview as string,
      status: r.status as Status,
      created_at: r.created_at as string,
      deprecated_at: (r.deprecated_at as string | null) ?? null,
      grace_until: (r.grace_until as string | null) ?? null,
      last_verified_at: (r.last_verified_at as string | null) ?? null,
      created_by: (r.created_by as string | null) ?? null,
      created_by_name: r.created_by ? nameMap.get(r.created_by as string) ?? null : null,
    }));

    const envFallback = !out.some((r) => r.status === "active");
    return { rows: out, envFallbackInUse: envFallback };
  });

export const rotatePartnerWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      graceHours: z.number().int().min(0).max(720).optional().default(48),
    }).parse(d ?? {})
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Deprecate current active
    const nowIso = new Date().toISOString();
    const graceUntil = new Date(Date.now() + data.graceHours * 3600_000).toISOString();
    const { error: depErr } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .update({ status: "deprecated", deprecated_at: nowIso, grace_until: graceUntil })
      .eq("status", "active");
    if (depErr) throw depErr;

    const secret = makeSecret(48);
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .insert({
        secret,
        secret_preview: makePreview(secret),
        status: "active",
        created_by: context.userId,
      })
      .select("id, secret_preview, created_at")
      .single();
    if (insErr || !inserted) throw insErr ?? new Error("Insert failed");

    return {
      id: inserted.id as string,
      secret,
      secret_preview: inserted.secret_preview as string,
      created_at: inserted.created_at as string,
      graceUntil,
    };
  });

export const revokeDeprecatedPartnerWebhookSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("partner_webhook_secrets")
      .update({ status: "revoked", grace_until: null })
      .eq("status", "deprecated");
    if (error) throw error;
    return { ok: true };
  });
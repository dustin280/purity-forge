import { createHmac, timingSafeEqual } from "crypto";

/**
 * Shared HMAC-SHA256 request verification for partner write endpoints
 * (order intake, compound registration). Secrets can live in
 * partner_webhook_secrets (rotatable, supports a deprecated+grace_until
 * overlap window) or the PARTNER_WEBHOOK_SECRET env var as a fallback.
 */

export type SecretCandidate = { id: string | null; secret: string; source: "db" | "env" };

function verifyHmacSignature(body: string, signature: string | null, secret: string): boolean {
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

async function loadPartnerWebhookSecrets(): Promise<SecretCandidate[]> {
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
    console.error("[partner-webhook-auth] failed loading DB secrets", e);
  }
  const envSecret = process.env.PARTNER_WEBHOOK_SECRET;
  if (envSecret) out.push({ id: null, secret: envSecret, source: "env" });
  return out;
}

/** Verifies an x-signature header against all known secrets; best-effort bumps last_verified_at on a DB-sourced match. Returns the matched candidate, or null if no secret is configured / none matched. */
export async function verifyPartnerRequest(body: string, signature: string | null): Promise<SecretCandidate | null> {
  const candidates = await loadPartnerWebhookSecrets();
  if (candidates.length === 0) {
    console.error("[partner-webhook-auth] no partner webhook secret configured (DB or env)");
    return null;
  }
  const matched = candidates.find((c) => verifyHmacSignature(body, signature, c.secret));
  if (matched?.id) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("partner_webhook_secrets")
        .update({ last_verified_at: new Date().toISOString() })
        .eq("id", matched.id);
    } catch (e) {
      console.error("[partner-webhook-auth] last_verified_at update failed", e);
    }
  }
  return matched ?? null;
}

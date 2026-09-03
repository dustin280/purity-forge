import { createHmac, timingSafeEqual } from "crypto";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";

/**
 * Request verification for the on-prem instrument agent (see
 * tools/agilent-tap-agent/ and src/lib/instrument-feed.server.ts).
 *
 * Every request carries `x-instrument-id` (the instruments.id the agent is
 * reporting for) and `x-signature` = hex HMAC-SHA256 of the raw request
 * body under one of that instrument's active keys in instrument_feed_keys.
 * Same scheme as the partner order webhook (partner-webhook-auth.server.ts),
 * scoped per instrument so one lab PC's key can't post as another instrument.
 */

export interface InstrumentFeedAuth {
  instrumentId: string;
  keyId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signatureMatches(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const given = Buffer.from(signature.trim().toLowerCase(), "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length) return false;
  try {
    return timingSafeEqual(given, want);
  } catch {
    return false;
  }
}

export async function verifyInstrumentFeedRequest(
  request: Request,
  body: string,
): Promise<InstrumentFeedAuth | null> {
  const instrumentId = request.headers.get("x-instrument-id")?.trim() ?? "";
  const signature = request.headers.get("x-signature");
  if (!UUID_RE.test(instrumentId) || !signature) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as AnySupabase;
  const { data, error } = await db
    .from("instrument_feed_keys")
    .select("id, secret")
    .eq("instrument_id", instrumentId)
    .eq("is_active", true);
  if (error) {
    console.error("[instrument-feed-auth] key lookup failed", error);
    return null;
  }
  for (const key of (data ?? []) as Array<{ id: string; secret: string }>) {
    if (signatureMatches(body, signature, key.secret)) {
      return { instrumentId, keyId: key.id };
    }
  }
  return null;
}

/** Best-effort "last seen" bookkeeping on the key that signed a request. */
export async function touchInstrumentFeedKey(
  keyId: string,
  agent: { host?: string | null; version?: string | null } | undefined,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as AnySupabase;
    await db
      .from("instrument_feed_keys")
      .update({
        last_seen_at: new Date().toISOString(),
        last_agent_host: agent?.host ?? null,
        last_agent_version: agent?.version ?? null,
      })
      .eq("id", keyId);
  } catch (e) {
    console.error("[instrument-feed-auth] touch failed", e);
  }
}

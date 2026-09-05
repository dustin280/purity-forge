/**
 * Admin side of the public live viewer: generate, list and revoke passcodes.
 * Reads/writes go through the caller's RLS-scoped client (admin-only
 * policies on public_live_access_codes); the code itself is returned exactly
 * once and only its hash is stored.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import {
  PUBLIC_LIVE_DEFAULT_HOURS,
  PUBLIC_LIVE_MAX_HOURS,
  PUBLIC_LIVE_MAX_LEAD_DAYS,
  generateCode,
  normalizeCode,
  sha256Hex,
} from "@/lib/public-live.server";

export interface PublicLiveCodeRow {
  id: string;
  label: string | null;
  code_hint: string;
  instrument_id: string | null;
  created_at: string;
  /** when the watch session goes live */
  starts_at: string;
  /** when it ends (code and viewing alike) */
  code_expires_at: string;
  redeemed_at: string | null;
  session_expires_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
}

async function assertAdmin(db: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listPublicLiveCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublicLiveCodeRow[]> => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { data, error } = await db
      .from("public_live_access_codes")
      .select(
        "id, label, code_hint, instrument_id, created_at, starts_at, code_expires_at, redeemed_at, session_expires_at, revoked_at, last_seen_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as PublicLiveCodeRow[];
  });

export const createPublicLiveCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().max(80).optional(),
        instrument_id: z.string().uuid().nullable().optional(),
        /** session length; default PUBLIC_LIVE_DEFAULT_HOURS */
        hours: z.number().int().min(1).max(PUBLIC_LIVE_MAX_HOURS).optional(),
        /** ISO start; omitted, null or in the past = now */
        starts_at: z.string().max(40).nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      id: string;
      code: string;
      starts_at: string;
      expires_at: string;
      hours: number;
    }> => {
      const db = context.supabase as AnySupabase;
      await assertAdmin(db, context.userId);
      const hours = data.hours ?? PUBLIC_LIVE_DEFAULT_HOURS;
      const now = Date.now();
      let start = now;
      if (data.starts_at) {
        const t = new Date(data.starts_at).getTime();
        if (Number.isNaN(t)) throw new Error("Invalid start time");
        if (t > now + PUBLIC_LIVE_MAX_LEAD_DAYS * 86_400_000)
          throw new Error(`Start time is more than ${PUBLIC_LIVE_MAX_LEAD_DAYS} days away`);
        start = Math.max(t, now);
      }
      const startsAt = new Date(start).toISOString();
      // The whole watch session — code and viewing — ends `hours` after it starts.
      const expires = new Date(start + hours * 3_600_000).toISOString();
      const code = generateCode();
      const { data: row, error } = await db
        .from("public_live_access_codes")
        .insert({
          code_hash: await sha256Hex(normalizeCode(code)),
          code_hint: code.slice(-4),
          label: data.label?.trim() || null,
          instrument_id: data.instrument_id ?? null,
          created_by: context.userId,
          starts_at: startsAt,
          code_expires_at: expires,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Shown once; afterwards only the hint is available.
      return { id: row.id, code, starts_at: startsAt, expires_at: expires, hours };
    },
  );

export const revokePublicLiveCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { error } = await db
      .from("public_live_access_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

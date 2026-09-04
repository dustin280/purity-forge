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
  PUBLIC_LIVE_SESSION_HOURS,
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
        "id, label, code_hint, instrument_id, created_at, code_expires_at, redeemed_at, session_expires_at, revoked_at, last_seen_at",
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
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<{ id: string; code: string; expires_at: string }> => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const code = generateCode();
    // The whole watch session — code and viewing — ends 12 h from now.
    const expires = new Date(Date.now() + PUBLIC_LIVE_SESSION_HOURS * 3_600_000).toISOString();
    const { data: row, error } = await db
      .from("public_live_access_codes")
      .insert({
        code_hash: await sha256Hex(normalizeCode(code)),
        code_hint: code.slice(-4),
        label: data.label?.trim() || null,
        instrument_id: data.instrument_id ?? null,
        created_by: context.userId,
        code_expires_at: expires,
      })
      .select("id")
      .single();
    if (error) throw error;
    // Shown once; afterwards only the hint is available.
    return { id: row.id, code, expires_at: expires };
  });

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

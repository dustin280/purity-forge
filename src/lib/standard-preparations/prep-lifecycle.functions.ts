/**
 * Server functions for standard prep volume/lifecycle tracking (Track A3):
 * recording a withdrawal, discarding a bottle, and reading its usage
 * history. The actual decrement math lives in the record_standard_usage()
 * SQL function (atomic — avoids a read-modify-write race between two
 * analysts drawing from the same bottle at once); these are thin wrappers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordStandardUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    prep_id: z.string().uuid(),
    withdrawn_ml: z.number().positive(),
    actor_name: z.string().min(1).max(255),
    purpose: z.string().max(255).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: remaining, error } = await context.supabase.rpc("record_standard_usage", {
      p_prep_id: data.prep_id,
      p_withdrawn_ml: data.withdrawn_ml,
      p_actor_id: context.userId,
      p_actor_name: data.actor_name,
      // generated RPC arg types are non-nullable, but the SQL function
      // accepts NULL for these optional fields
      p_purpose: data.purpose ?? null,
      p_notes: data.notes ?? null,
    } as never);
    if (error) throw error;
    return { volume_remaining_ml: remaining as number };
  });

export const discardStandardPrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    prep_id: z.string().uuid(),
    actor_name: z.string().min(1).max(255),
    reason: z.string().max(2000).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("discard_standard_prep", {
      p_prep_id: data.prep_id,
      p_actor_name: data.actor_name,
      p_reason: data.reason ?? null,
    } as never);
    if (error) throw error;
    return { ok: true };
  });

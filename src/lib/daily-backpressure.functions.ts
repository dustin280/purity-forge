/**
 * Server functions for the Daily Backpressure log: list, create, and update HPLC system backpressure readings. All endpoints require authentication; RLS scopes writes per user/role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BackpressureRow {
  id: string;
  reading_at: string;
  user_name: string;
  user_id: string | null;
  instrument: string;
  backpressure: number;
  backpressure_unit: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const payloadSchema = z.object({
  reading_at: z.string().min(1),
  user_name: z.string().min(1).max(255),
  instrument: z.string().min(1).max(255),
  backpressure: z.number().finite(),
  backpressure_unit: z.string().min(1).max(32),
  notes: z.string().max(2000).nullable().optional(),
});

export const listBackpressureLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("daily_backpressure_logs")
      .select("*")
      .order("reading_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as BackpressureRow[];
  });

export const createBackpressureLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("daily_backpressure_logs")
      .insert({
        ...data,
        notes: data.notes || null,
        user_id: context.userId,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as BackpressureRow;
  });

export const deleteBackpressureLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("daily_backpressure_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
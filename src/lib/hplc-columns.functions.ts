/**
 * HPLC columns registry: list and create entries used by the Daily Backpressure
 * Log "Column" selector. New entries can be created from the Material Receipt
 * form via a checkbox.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface HplcColumnRow {
  id: string;
  name: string;
  part_number: string | null;
  source_receipt_id: string | null;
  is_active: boolean;
  installed_on_instrument_id: string | null;
  installed_at: string | null;
  rated_max_pressure_bar: number | null;
  total_injections: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const listHplcColumns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("hplc_columns")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as HplcColumnRow[];
  });

const createSchema = z.object({
  name: z.string().min(1).max(500),
  part_number: z.string().max(200).nullable().optional(),
  source_receipt_id: z.string().uuid().nullable().optional(),
  // Lets a column that's already partway through its life get registered
  // with a real starting count instead of silently starting at 0.
  total_injections: z.number().int().min(0).max(10_000_000).nullable().optional(),
  rated_max_pressure_bar: z.number().positive().nullable().optional(),
});

export const createHplcColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const name = data.name.trim();
    // No-op if a column with this name already exists.
    const { data: existing } = await context.supabase
      .from("hplc_columns")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    if (existing) return existing as HplcColumnRow;

    const { data: row, error } = await context.supabase
      .from("hplc_columns")
      .insert({
        name,
        part_number: data.part_number || null,
        source_receipt_id: data.source_receipt_id || null,
        total_injections: data.total_injections ?? 0,
        rated_max_pressure_bar: data.rated_max_pressure_bar ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as HplcColumnRow;
  });

export const updateHplcColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(500).optional(),
      part_number: z.string().max(200).nullable().optional(),
      is_active: z.boolean().optional(),
      rated_max_pressure_bar: z.number().positive().nullable().optional(),
      total_injections: z.number().int().min(0).max(10_000_000).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("hplc_columns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as HplcColumnRow;
  });

// Only one column can be "installed" on a given instrument at a time
// (enforced by a partial unique index too) — clear any prior holder before
// setting the new one so the UI never has to handle a constraint-violation
// round-trip. Pass instrumentId: null to just uninstall.
export const setInstalledColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      columnId: z.string().uuid(),
      instrumentId: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.instrumentId) {
      const { error: clearError } = await context.supabase
        .from("hplc_columns")
        .update({ installed_on_instrument_id: null, installed_at: null })
        .eq("installed_on_instrument_id", data.instrumentId);
      if (clearError) throw clearError;
    }
    const { data: row, error } = await context.supabase
      .from("hplc_columns")
      .update({
        installed_on_instrument_id: data.instrumentId,
        installed_at: data.instrumentId ? new Date().toISOString() : null,
      })
      .eq("id", data.columnId)
      .select()
      .single();
    if (error) throw error;
    return row as HplcColumnRow;
  });

export const deleteHplcColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("hplc_columns")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
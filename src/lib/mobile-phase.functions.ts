/**
 * Server functions for Mobile Phase Prep Logs: list/get/create/delete prep
 * records and CRUD for the admin-managed reagent list. All access requires
 * authentication; RLS scopes writes per role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPreparation, type PrepSide } from "@/lib/mobile-phase-instructions";

const sideSchema = z.object({
  enabled: z.boolean(),
  solvent: z.string().max(255).default(""),
  solvent_pct: z.number().min(0).max(100).default(0),
  modifier: z.string().max(255).nullable().default(null),
  modifier_pct: z.number().min(0).max(100).default(0),
  diluent: z.string().max(255).default(""),
  notes: z.string().max(2000).nullable().optional(),
});

const createSchema = z.object({
  prepared_at: z.string().min(1),
  user_name: z.string().min(1).max(255),
  user_initials: z.string().min(1).max(8),
  lot_number: z.string().min(1).max(64),
  total_volume: z.number().positive(),
  total_volume_unit: z.enum(["mL", "L"]),
  prep_a: sideSchema,
  prep_b: sideSchema,
});

export interface MobilePhasePrepRow {
  id: string;
  log_number: string;
  prepared_at: string;
  user_id: string | null;
  user_name: string;
  user_initials: string;
  lot_number: string;
  total_volume: number;
  total_volume_unit: string;
  prep_a: PrepSide;
  prep_b: PrepSide;
  preparation: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MobilePhaseReagentRow {
  id: string;
  name: string;
  kinds: string[];
  is_active: boolean;
  sort_order: number;
}

export const listMobilePhasePreps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mobile_phase_prep_logs")
      .select("*")
      .order("prepared_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as MobilePhasePrepRow[];
  });

export const getMobilePhasePrep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("mobile_phase_prep_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row as MobilePhasePrepRow | null;
  });

export const createMobilePhasePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    if (!data.prep_a.enabled && !data.prep_b.enabled) {
      throw new Error("At least one of Mobile Phase A or B must be enabled");
    }
    // Insert first to obtain log_number, then update preparation text
    const { data: inserted, error: insErr } = await context.supabase
      .from("mobile_phase_prep_logs")
      .insert({
        prepared_at: data.prepared_at,
        user_id: context.userId,
        user_name: data.user_name,
        user_initials: data.user_initials,
        lot_number: data.lot_number,
        total_volume: data.total_volume,
        total_volume_unit: data.total_volume_unit,
        prep_a: data.prep_a,
        prep_b: data.prep_b,
        preparation: "",
        created_by: context.userId,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const preparation = buildPreparation({
      log_number: inserted.log_number,
      lot_number: data.lot_number,
      prepared_at: data.prepared_at,
      user_initials: data.user_initials,
      user_name: data.user_name,
      total_volume: data.total_volume,
      total_volume_unit: data.total_volume_unit,
      prep_a: data.prep_a,
      prep_b: data.prep_b,
    });

    const { data: updated, error: updErr } = await context.supabase
      .from("mobile_phase_prep_logs")
      .update({ preparation })
      .eq("id", inserted.id)
      .select()
      .single();
    if (updErr) throw updErr;
    return updated as MobilePhasePrepRow;
  });

export const deleteMobilePhasePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("mobile_phase_prep_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Reagents ----------

export const listMobilePhaseReagents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mobile_phase_reagents")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MobilePhaseReagentRow[];
  });

const reagentSchema = z.object({
  name: z.string().min(1).max(255),
  kinds: z.array(z.enum(["solvent", "modifier", "diluent"])).min(1),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const createMobilePhaseReagent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reagentSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("mobile_phase_reagents")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return row as MobilePhaseReagentRow;
  });

export const updateMobilePhaseReagent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(reagentSchema.partial()).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("mobile_phase_reagents")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as MobilePhaseReagentRow;
  });

export const deleteMobilePhaseReagent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("mobile_phase_reagents")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
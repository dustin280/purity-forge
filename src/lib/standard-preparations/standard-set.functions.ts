/**
 * Server functions for the "Standard Set" guided flow -- a single prep
 * event that yields N labeled concentration levels (calibration standards,
 * or matched-level multi-compound blends like SUMMIT), each level possibly
 * carrying more than one compound. This is the first concrete step toward
 * the confirmed 2026-08-23 Sample/Standard Prep target design: one document
 * combining vial labels + recipe + record (see cutsheet-pdf.ts and memory
 * purity-forge-sample-prep-target-design).
 *
 * Reuses standard_preparation_logs + standard_preparation_targets (one row
 * per level, row_no = level number) exactly like the other guided flows
 * (prep-solid.functions.ts etc). Adds standard_preparation_target_components
 * for the case a level has more than one compound -- the piece that didn't
 * exist anywhere in the schema before tonight.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDaysISO } from "./prep-shared.server";

const componentSchema = z.object({
  compound_id: z.string().uuid().nullable().optional(),
  compound_name: z.string().min(1).max(160),
  abbrev: z.string().min(1).max(20),
  concentration_mg_per_ml: z.number().nullable().optional(),
  stock_volume_ul: z.number().nullable().optional(),
});

const levelSchema = z.object({
  row_no: z.number().int().min(1),
  label: z.string().min(1).max(20), // "L1"
  components: z.array(componentSchema).min(1).max(12),
  diluent_volume_ul: z.number().nullable().optional(),
  expected_note: z.string().max(500).nullable().optional(),
});

const createSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  standard_name: z.string().min(1).max(255),
  diluent_name: z.string().max(255),
  batch_volume_ml: z.number().positive(),
  levels: z.array(levelSchema).min(1).max(20),
  range_reasoning: z.string().max(4000).nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
});

export const createStandardSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const preparedDate = new Date(data.prepared_at).toISOString().slice(0, 10);

    const { data: synRes, error: synErr } = await context.supabase
      .rpc("next_syn_id", { p_user_token: data.user_token, p_day: preparedDate });
    if (synErr) throw synErr;
    const syn_id = synRes as unknown as string;

    const days = data.expiration_period_days ?? null;
    const expirationDate = days ? addDaysISO(data.prepared_at, days) : null;

    const compoundNames = Array.from(new Set(data.levels.flatMap(l => l.components.map(c => c.compound_name))));
    const levelCount = data.levels.length;

    const logPayload: Record<string, unknown> = {
      prepared_at: new Date(data.prepared_at).toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      target_concentration: `${levelCount}-level set`,
      final_volume: `${data.batch_volume_ml} mL each`,
      solvent: data.diluent_name,
      final_diluent: data.diluent_name,
      preparation_steps: [],
      expiration_date: expirationDate,
      storage_condition: data.storage_condition ?? null,
      storage_location: data.storage_location ?? null,
      container_label: syn_id,
      status: "approved",
      approver_id: context.userId,
      approver_name: data.analyst_name,
      approved_at: new Date().toISOString(),
      reviewer_id: context.userId,
      reviewer_name: data.analyst_name,
      reviewed_at: new Date().toISOString(),
      notes: data.range_reasoning ?? null,
      expiration_period_code: data.expiration_period_code ?? null,
      expiration_period_days: days,
      material_overridden: false,
      ref_material_name: compoundNames.join(", "),
      ref_form: "solid",
      syn_id,
      prep_type: "standard_set",
      final_volume_ml: data.batch_volume_ml,
    };

    const { data: row, error: insErr } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(logPayload as any)
      .select("id, log_number, syn_id")
      .single();
    if (insErr) throw insErr;

    for (const level of data.levels) {
      const primary = level.components[0];
      const { data: targetRow, error: tErr } = await context.supabase
        .from("standard_preparation_targets")
        .insert({
          prep_id: row.id,
          row_no: level.row_no,
          name: level.label,
          target_concentration_mg_per_ml: primary?.concentration_mg_per_ml ?? null,
          target_concentration_unit: "mg/mL",
          target_volume_ml: data.batch_volume_ml,
          calculated_mass_mg: null,
          calculated_volume_ml: primary?.stock_volume_ul != null ? primary.stock_volume_ul / 1000 : null,
          notes: level.expected_note ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();
      if (tErr) throw tErr;

      const componentRows = level.components.map((c, i) => ({
        target_id: targetRow.id,
        compound_id: c.compound_id ?? null,
        compound_name: c.compound_name,
        concentration_mg_per_ml: c.concentration_mg_per_ml ?? null,
        stock_volume_ul: c.stock_volume_ul ?? null,
        sort_order: i,
      }));
      if (level.diluent_volume_ul != null) {
        componentRows.push({
          target_id: targetRow.id,
          compound_id: null,
          compound_name: `${data.diluent_name} (diluent)`,
          concentration_mg_per_ml: null,
          stock_volume_ul: level.diluent_volume_ul,
          sort_order: level.components.length,
        });
      }
      const { error: cErr } = await context.supabase
        .from("standard_preparation_target_components")
        .insert(componentRows);
      if (cErr) throw cErr;
    }

    return { id: row.id as string, log_number: row.log_number as string, syn_id: (row.syn_id as string | null) ?? syn_id };
  });

export interface StandardSetLevel {
  target_id: string;
  row_no: number;
  label: string;
  components: Array<{
    compound_name: string;
    concentration_mg_per_ml: number | null;
    stock_volume_ul: number | null;
  }>;
  diluent_volume_ul: number | null;
  expected_note: string | null;
}

export interface StandardSetDetail {
  id: string;
  log_number: string;
  syn_id: string | null;
  standard_name: string;
  analyst_name: string;
  prepared_at: string;
  final_diluent: string | null;
  final_volume_ml: number | null;
  notes: string | null;
  reviewer_name: string | null;
  approved_at: string | null;
  levels: StandardSetLevel[];
}

export const getStandardSet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<StandardSetDetail> => {
    const { data: log, error: logErr } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, syn_id, standard_name, analyst_name, prepared_at, final_diluent, final_volume_ml, notes, reviewer_name, approved_at")
      .eq("id", data.id)
      .single();
    if (logErr) throw logErr;

    const { data: targets, error: tErr } = await context.supabase
      .from("standard_preparation_targets")
      .select("id, row_no, name, notes")
      .eq("prep_id", data.id)
      .order("row_no", { ascending: true });
    if (tErr) throw tErr;

    const targetIds = (targets ?? []).map(t => t.id);
    const { data: components, error: cErr } = targetIds.length
      ? await context.supabase
        .from("standard_preparation_target_components")
        .select("target_id, compound_name, concentration_mg_per_ml, stock_volume_ul, sort_order")
        .in("target_id", targetIds)
        .order("sort_order", { ascending: true })
      : { data: [], error: null };
    if (cErr) throw cErr;

    const levels: StandardSetLevel[] = (targets ?? []).map(t => {
      const rows = (components ?? []).filter(c => c.target_id === t.id);
      const diluentRow = rows.find(c => c.compound_name.endsWith("(diluent)"));
      const compoundRows = rows.filter(c => c !== diluentRow);
      return {
        target_id: t.id,
        row_no: t.row_no,
        label: t.name ?? `L${t.row_no}`,
        components: compoundRows.map(c => ({
          compound_name: c.compound_name,
          concentration_mg_per_ml: c.concentration_mg_per_ml,
          stock_volume_ul: c.stock_volume_ul,
        })),
        diluent_volume_ul: diluentRow?.stock_volume_ul ?? null,
        expected_note: t.notes || null,
      };
    });

    return { ...(log as Omit<StandardSetDetail, "levels">), levels };
  });

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
  /** Which stock the aliquot comes from. Absent/null means the primary. */
  source_label: z.string().max(60).nullable().optional(),
});

/**
 * A weaker stock made up so the low levels can be pipetted at all. Ordered:
 * a 1:100 is a dilution of the 1:10, so these are made top to bottom.
 */
const intermediateStepSchema = z.object({
  compound_id: z.string().uuid().nullable().optional(),
  compound_name: z.string().min(1).max(160),
  label: z.string().min(1).max(60),
  source_label: z.string().min(1).max(60),
  factor: z.number().positive(),
  concentration_mg_per_ml: z.number().nullable().optional(),
  aliquot_ul: z.number().nullable().optional(),
  diluent_ul: z.number().nullable().optional(),
  volume_ul: z.number().nullable().optional(),
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
  intermediate_steps: z.array(intermediateStepSchema).max(60).optional(),
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

    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "STDP", p_source_table: "standard_preparation_logs", p_source_id: rowId, p_date: preparedDate, p_created_by: context.userId });
    if (docErr) throw docErr;
    const log_number = docNumber as unknown as string;

    const days = data.expiration_period_days ?? null;
    const expirationDate = days ? addDaysISO(data.prepared_at, days) : null;

    const compoundNames = Array.from(new Set(data.levels.flatMap(l => l.components.map(c => c.compound_name))));
    const levelCount = data.levels.length;

    const logPayload: Record<string, unknown> = {
      id: rowId,
      log_number,
      prepared_at: new Date(data.prepared_at).toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      target_concentration: `${levelCount}-level set`,
      final_volume: `${data.batch_volume_ml} mL each`,
      solvent: data.diluent_name,
      final_diluent: data.diluent_name,
      preparation_steps: data.intermediate_steps ?? [],
      expiration_date: expirationDate,
      storage_condition: data.storage_condition ?? null,
      storage_location: data.storage_location ?? null,
      container_label: log_number,
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
      prep_type: "standard_set",
      final_volume_ml: data.batch_volume_ml,
    };

    const { data: row, error: insErr } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(logPayload as any)
      .select("id, log_number")
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
        source_label: c.source_label ?? null,
        sort_order: i,
      }));
      if (level.diluent_volume_ul != null) {
        componentRows.push({
          target_id: targetRow.id,
          compound_id: null,
          compound_name: `${data.diluent_name} (diluent)`,
          concentration_mg_per_ml: null,
          stock_volume_ul: level.diluent_volume_ul,
          source_label: null,
          sort_order: level.components.length,
        });
      }
      const { error: cErr } = await context.supabase
        .from("standard_preparation_target_components")
        .insert(componentRows);
      if (cErr) throw cErr;
    }

    return { id: row.id as string, log_number: row.log_number as string };
  });

/**
 * Recalculated-and-corrected copy of an already-submitted Standard Set.
 * Dustin, 2026-09-02: "there is no way to edit or add notes to an existing
 * preparation" -> full recipe editing -> "it should recalculate so you can
 * save a new updated variation" -> "it should get a new ID too, that's a
 * new prep record."
 *
 * This is why: standard_preparation_logs auto-approves at creation (no
 * review gate for this prep type), so a genuinely different set of numbers
 * -- which is what a recalculation produces -- shouldn't retroactively
 * become what an already-approved record says it always was. A real
 * analyst already lived this exact situation on SYN-STDP-000059 this
 * session: found the numbers wrong, discarded the prep, and (implicitly)
 * was going to make a fresh one. This formalizes that same real workflow --
 * discard-and-reprep -- as one action that keeps the two records linked,
 * instead of two disconnected ones. Mirrors createStandardSet almost
 * exactly (new id, new registered log_number, same targets/components
 * insert shape); the only additions are revised_from_id (which record this
 * corrects) and a one-entry edit_history seeded with who/when/why.
 */
const revisionSchema = z.object({
  revised_from_id: z.string().uuid(),
  analyst_name: z.string().min(1).max(255),
  summary: z.string().min(1).max(500),
  standard_name: z.string().min(1).max(255),
  diluent_name: z.string().max(255),
  batch_volume_ml: z.number().positive(),
  range_reasoning: z.string().max(4000).nullable().optional(),
  levels: z.array(levelSchema).min(1).max(20),
  intermediate_steps: z.array(intermediateStepSchema).max(60).optional(),
});

export const createStandardSetRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => revisionSchema.parse(d))
  .handler(async ({ context, data }) => {
    const preparedDate = new Date().toISOString().slice(0, 10);
    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "STDP", p_source_table: "standard_preparation_logs", p_source_id: rowId, p_date: preparedDate, p_created_by: context.userId });
    if (docErr) throw docErr;
    const log_number = docNumber as unknown as string;

    const compoundNames = Array.from(new Set(data.levels.flatMap(l => l.components.map(c => c.compound_name))));
    const levelCount = data.levels.length;

    const logPayload: Record<string, unknown> = {
      id: rowId,
      log_number,
      prepared_at: new Date().toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      target_concentration: `${levelCount}-level set`,
      final_volume: `${data.batch_volume_ml} mL each`,
      solvent: data.diluent_name,
      final_diluent: data.diluent_name,
      preparation_steps: data.intermediate_steps ?? [],
      container_label: log_number,
      status: "approved",
      approver_id: context.userId,
      approver_name: data.analyst_name,
      approved_at: new Date().toISOString(),
      reviewer_id: context.userId,
      reviewer_name: data.analyst_name,
      reviewed_at: new Date().toISOString(),
      notes: data.range_reasoning ?? null,
      material_overridden: false,
      ref_material_name: compoundNames.join(", "),
      ref_form: "solid",
      prep_type: "standard_set",
      final_volume_ml: data.batch_volume_ml,
      revised_from_id: data.revised_from_id,
      edit_history: [{ at: new Date().toISOString(), by: data.analyst_name, summary: data.summary }],
    };

    const { data: row, error: insErr } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(logPayload as any)
      .select("id, log_number")
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
        source_label: c.source_label ?? null,
        sort_order: i,
      }));
      if (level.diluent_volume_ul != null) {
        componentRows.push({
          target_id: targetRow.id,
          compound_id: null,
          compound_name: `${data.diluent_name} (diluent)`,
          concentration_mg_per_ml: null,
          stock_volume_ul: level.diluent_volume_ul,
          source_label: null,
          sort_order: level.components.length,
        });
      }
      const { error: cErr } = await context.supabase
        .from("standard_preparation_target_components")
        .insert(componentRows);
      if (cErr) throw cErr;
    }

    return { id: row.id as string, log_number: row.log_number as string };
  });

/** Records revised FROM this one, newest first -- shown on the original so
 * "this was corrected, here's the corrected version" is visible from
 * either end of the link. */
export const listStandardSetRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, standard_name, prepared_at")
      .eq("revised_from_id", data.id)
      .order("prepared_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as Array<{ id: string; log_number: string; standard_name: string; prepared_at: string }>;
  });

export interface StandardSetLevel {
  target_id: string;
  row_no: number;
  label: string;
  components: Array<{
    compound_id: string | null;
    compound_name: string;
    concentration_mg_per_ml: number | null;
    stock_volume_ul: number | null;
    /** Which stock this aliquot came from. Null means the primary. */
    source_label: string | null;
  }>;
  diluent_volume_ul: number | null;
  expected_note: string | null;
}

export interface EditHistoryEntry {
  at: string;
  by: string;
  summary: string;
}

export interface StandardSetDetail {
  id: string;
  log_number: string;
  standard_name: string;
  analyst_name: string;
  prepared_at: string;
  final_diluent: string | null;
  final_volume_ml: number | null;
  notes: string | null;
  reviewer_name: string | null;
  approved_at: string | null;
  levels: StandardSetLevel[];
  /** Weaker stocks made before the levels, in the order they're made. */
  intermediateSteps: StandardSetIntermediate[];
  /** Newest first. Empty for a record that's never been corrected. */
  editHistory: EditHistoryEntry[];
  /** The record this one recalculates/corrects, if any. */
  revisedFrom: { id: string; log_number: string } | null;
}

export interface StandardSetIntermediate {
  compound_name: string;
  label: string;
  source_label: string;
  factor: number;
  concentration_mg_per_ml: number | null;
  aliquot_ul: number | null;
  diluent_ul: number | null;
  volume_ul: number | null;
}

export const getStandardSet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<StandardSetDetail> => {
    const { data: log, error: logErr } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, standard_name, analyst_name, prepared_at, final_diluent, final_volume_ml, notes, reviewer_name, approved_at, preparation_steps, edit_history, revised_from_id")
      .eq("id", data.id)
      .single();
    if (logErr) throw logErr;

    // Separate lookup rather than an embedded select -- a self-referencing
    // FK disambiguated by constraint name doesn't type-infer cleanly
    // through supabase-js's generated client, and this is one cheap query.
    const revisedFromId = (log as { revised_from_id?: string | null }).revised_from_id;
    let revisedFrom: { id: string; log_number: string } | null = null;
    if (revisedFromId) {
      const { data: parent } = await context.supabase
        .from("standard_preparation_logs")
        .select("id, log_number")
        .eq("id", revisedFromId)
        .maybeSingle();
      revisedFrom = parent ?? null;
    }

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
        .select("target_id, compound_id, compound_name, concentration_mg_per_ml, stock_volume_ul, source_label, sort_order")
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
          compound_id: c.compound_id ?? null,
          compound_name: c.compound_name,
          concentration_mg_per_ml: c.concentration_mg_per_ml,
          stock_volume_ul: c.stock_volume_ul,
          source_label: c.source_label ?? null,
        })),
        diluent_volume_ul: diluentRow?.stock_volume_ul ?? null,
        expected_note: t.notes || null,
      };
    });

    // preparation_steps is jsonb and was an empty array for every set made
    // before intermediate stocks existed, so an old record reads as "none".
    const raw = (log as { preparation_steps?: unknown }).preparation_steps;
    const intermediateSteps = (Array.isArray(raw) ? raw : []) as StandardSetIntermediate[];
    const editHistoryRaw = (log as { edit_history?: unknown }).edit_history;
    const editHistory = (Array.isArray(editHistoryRaw) ? editHistoryRaw : []) as EditHistoryEntry[];

    return {
      ...(log as Omit<StandardSetDetail, "levels" | "intermediateSteps" | "editHistory" | "revisedFrom">),
      levels,
      editHistory: [...editHistory].reverse(),
      intermediateSteps,
      revisedFrom,
    };
  });

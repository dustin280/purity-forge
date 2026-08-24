/**
 * Server functions for sample preparation records (Phase 1C).
 * Persist wizard plans, capture bench execution, and support review/approve.
 * All handlers auth-required; write authorization is enforced by RLS
 * plus explicit role checks for approve/reject.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type RecordStatus = "draft" | "in_progress" | "awaiting_review" | "approved" | "rejected";

export interface PrepRecord {
  id: string;
  prep_number: string;
  method_revision_id: string;
  analyte_id: string;
  status: RecordStatus;
  planned_target_concentration_mg_per_ml: number | null;
  planned_target_volume_ul: number | null;
  planned_calibration_level: number | null;
  sample_id: string | null;
  lot_number: string | null;
  sample_context: Json;
  solvent_formulation_id: string | null;
  plan: Json;
  total_dilution_factor: number | null;
  notes: string | null;
  prepared_by: string;
  prepared_at: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrepStep {
  id: string;
  record_id: string;
  step_no: number;
  kind: "reconstitute" | "dilute" | "aliquot";
  planned: Json;
  actual_mass_mg: number | null;
  actual_volume_ul: number | null;
  actual_diluent_ul: number | null;
  actual_final_volume_ul: number | null;
  actual_conc_mg_per_ml: number | null;
  vessel_id: string | null;
  equipment_id: string | null;
  balance_id: string | null;
  reagent_lot_id: string | null;
  solvent_lot_id: string | null;
  performed_at: string | null;
  performed_by_initials: string | null;
  deviation_flag: boolean;
  notes: string | null;
}

// ---------------- Create ----------------

const CreateSchema = z.object({
  method_revision_id: z.string().uuid(),
  analyte_id: z.string().uuid(),
  planned_target_concentration_mg_per_ml: z.number().nullable().optional(),
  planned_target_volume_ul: z.number().nullable().optional(),
  planned_calibration_level: z.number().nullable().optional(),
  sample_id: z.string().nullable().optional(),
  lot_number: z.string().nullable().optional(),
  sample_context: z.record(z.string(), z.any()).default({}),
  solvent_formulation_id: z.string().uuid().nullable().optional(),
  plan: z.record(z.string(), z.any()).default({}),
  total_dilution_factor: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** Steps derived from the plan; will seed sp_preparation_steps. */
  steps: z
    .array(
      z.object({
        step_no: z.number().int().positive(),
        kind: z.enum(["reconstitute", "dilute", "aliquot"]),
        planned: z.record(z.string(), z.any()).default({}),
      }),
    )
    .default([]),
});

export const createDraftRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const recordId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "SAMP", p_source_table: "sp_preparation_records", p_source_id: recordId, p_created_by: context.userId });
    if (docErr) throw docErr;
    const prep_number = docNumber as unknown as string;

    const { steps, ...header } = data;
    const { data: record, error } = await context.supabase
      .from("sp_preparation_records")
      .insert({
        ...header,
        id: recordId,
        sample_context: header.sample_context as Json,
        plan: header.plan as Json,
        prep_number,
        status: "draft",
        prepared_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;

    if (steps.length) {
      const { error: sErr } = await context.supabase
        .from("sp_preparation_steps")
        .insert(steps.map((s) => ({ ...s, planned: s.planned as Json, record_id: record.id })));
      if (sErr) throw sErr;
    }

    return { id: record.id as string, prep_number };
  });

// ---------------- Read ----------------

export const listRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sp_preparation_records")
      .select("id, prep_number, status, method_revision_id, analyte_id, sample_id, lot_number, prepared_by, prepared_at, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const getRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: record, error: rErr }, { data: steps, error: sErr }] = await Promise.all([
      context.supabase.from("sp_preparation_records").select("*").eq("id", data.id).single(),
      context.supabase.from("sp_preparation_steps").select("*").eq("record_id", data.id).order("step_no"),
    ]);
    if (rErr) throw rErr;
    if (sErr) throw sErr;
    return { record: record as unknown as PrepRecord, steps: (steps ?? []) as unknown as PrepStep[] };
  });

// ---------------- Draft update ----------------

export const updateDraftRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            planned_target_concentration_mg_per_ml: z.number().nullable().optional(),
            planned_target_volume_ul: z.number().nullable().optional(),
            planned_calibration_level: z.number().nullable().optional(),
            sample_id: z.string().nullable().optional(),
            lot_number: z.string().nullable().optional(),
            sample_context: z.record(z.string(), z.any()).optional(),
            solvent_formulation_id: z.string().uuid().nullable().optional(),
            plan: z.record(z.string(), z.any()).optional(),
            notes: z.string().nullable().optional(),
          })
          .default({}),
        steps: z
          .array(
            z.object({
              step_no: z.number().int().positive(),
              kind: z.enum(["reconstitute", "dilute", "aliquot"]),
              planned: z.record(z.string(), z.any()).default({}),
            }),
          )
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sp_preparation_records")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data.patch as any)
      .eq("id", data.id);
    if (error) throw error;
    if (data.steps) {
      await context.supabase.from("sp_preparation_steps").delete().eq("record_id", data.id);
      if (data.steps.length) {
        const { error: sErr } = await context.supabase
          .from("sp_preparation_steps")
          .insert(data.steps.map((s) => ({ ...s, planned: s.planned as Json, record_id: data.id })));
        if (sErr) throw sErr;
      }
    }
    return { ok: true };
  });

// ---------------- Step actual capture ----------------

const StepPatchSchema = z.object({
  actual_mass_mg: z.number().nullable().optional(),
  actual_volume_ul: z.number().nullable().optional(),
  actual_diluent_ul: z.number().nullable().optional(),
  actual_final_volume_ul: z.number().nullable().optional(),
  actual_conc_mg_per_ml: z.number().nullable().optional(),
  vessel_id: z.string().uuid().nullable().optional(),
  equipment_id: z.string().uuid().nullable().optional(),
  balance_id: z.string().uuid().nullable().optional(),
  reagent_lot_id: z.string().uuid().nullable().optional(),
  solvent_lot_id: z.string().uuid().nullable().optional(),
  performed_at: z.string().nullable().optional(),
  performed_by_initials: z.string().nullable().optional(),
  deviation_flag: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const saveExecutedStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        step_id: z.string().uuid(),
        patch: StepPatchSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sp_preparation_steps")
      .update(data.patch)
      .eq("id", data.step_id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- Transitions ----------------

async function assertRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  role: "admin" | "reviewer",
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  if (error) throw error;
  return data === true;
}

export const startExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sp_preparation_records")
      .update({ status: "in_progress", prepared_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const submitForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sp_preparation_records")
      .update({ status: "awaiting_review", submitted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const approveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), comment: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertRole(context.supabase, context.userId, "admin");
    const reviewer = admin || (await assertRole(context.supabase, context.userId, "reviewer"));
    if (!reviewer) throw new Error("Only reviewers or admins can approve preparation records.");
    const { error } = await context.supabase
      .from("sp_preparation_records")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_comment: data.comment ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const rejectRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), comment: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertRole(context.supabase, context.userId, "admin");
    const reviewer = admin || (await assertRole(context.supabase, context.userId, "reviewer"));
    if (!reviewer) throw new Error("Only reviewers or admins can reject preparation records.");
    const { error } = await context.supabase
      .from("sp_preparation_records")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_comment: data.comment,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sp_preparation_records").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const countRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("sp_preparation_records")
      .select("id", { count: "exact", head: true });
    return { count: count ?? 0 };
  });
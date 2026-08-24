/**
 * Server functions powering the guided Working Standard prep flow (Track A1):
 * dilute an existing approved, unexpired primary standard to a target
 * concentration/volume.
 * - searchApprovedStandardsUnexpired: picker source for step 1
 * - createWorkingStandard: writes the working-standard log + target row,
 *   chained back to its primary via parent_prep_id and inheriting the
 *   primary's own traceability fields so the chain reaches the vendor lot.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDaysISO } from "./prep-shared.server";

const CONC_UNITS = ["mg/mL", "mg/L", "µg/mL", "µg/L"] as const;

export const searchApprovedStandardsUnexpired = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    q: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const today = new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, standard_name, final_concentration_value, final_concentration_unit, final_volume_ml, volume_remaining_ml, lifecycle_status, expiration_date, material_receipt_id, ref_material_name, ref_lot, ref_purity_percent, ref_molecular_weight, ref_receipt_date")
      .eq("status", "approved")
      .ilike("prep_type", "primary_%")
      .neq("lifecycle_status", "discarded")
      .or("volume_remaining_ml.gt.0,volume_remaining_ml.is.null")
      .or(`expiration_date.is.null,expiration_date.gte.${today}`)
      .order("prepared_at", { ascending: true })
      .limit(data.limit ?? 20);
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `standard_name.ilike.${term}`,
          `log_number.ilike.${term}`,
          `ref_material_name.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      log_number: string;
      standard_name: string;
      final_concentration_value: number | null;
      final_concentration_unit: string | null;
      final_volume_ml: number | null;
      volume_remaining_ml: number | null;
      lifecycle_status: string;
      expiration_date: string | null;
      material_receipt_id: string | null;
      ref_material_name: string | null;
      ref_lot: string | null;
      ref_purity_percent: number | null;
      ref_molecular_weight: number | null;
      ref_receipt_date: string | null;
    }>;
  });

const workingPayloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  // Source (picked primary standard)
  parent_prep_id: z.string().uuid(),
  parent_expiration_date: z.string().nullable().optional(),
  // The actual amount drawn from the parent's true stock — for a serial
  // dilution this is always the FIRST step's aliquot; later steps dilute an
  // intermediate solution, never the parent again.
  parent_withdrawal_ml: z.number().positive(),
  material_receipt_id: z.string().uuid().nullable().optional(),
  ref_material_name: z.string().max(255).nullable().optional(),
  ref_lot: z.string().max(255).nullable().optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  stock_concentration_mg_per_ml: z.number().positive(),
  // Diluent
  diluent_name: z.string().min(1).max(120),
  diluent_lot: z.string().max(255).nullable().optional(),
  // Concentration
  standard_name: z.string().min(1).max(255),
  final_concentration_value: z.number().positive(),
  final_concentration_unit: z.enum(CONC_UNITS),
  final_volume_ml: z.number().positive(),
  target_concentration_mg_per_ml: z.number().positive(),
  // Storage
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  preparation_instructions: z.string().max(10000),
});

export const createWorkingStandard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workingPayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const preparedDate = new Date(data.prepared_at).toISOString().slice(0, 10);

    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "STDP", p_source_table: "standard_preparation_logs", p_source_id: rowId, p_date: preparedDate, p_created_by: context.userId });
    if (docErr) throw docErr;
    const log_number = docNumber as unknown as string;

    const days = data.expiration_period_days ?? null;
    let expirationDate = days && data.prepared_at ? addDaysISO(data.prepared_at, days) : null;
    // A working standard can't outlive the primary it was made from.
    if (expirationDate && data.parent_expiration_date && data.parent_expiration_date < expirationDate) {
      expirationDate = data.parent_expiration_date;
    } else if (!expirationDate && data.parent_expiration_date) {
      expirationDate = data.parent_expiration_date;
    }

    const concDisplay = `${data.final_concentration_value} ${data.final_concentration_unit}`;
    const volDisplay = `${data.final_volume_ml} mL`;

    const logPayload: Record<string, unknown> = {
      id: rowId,
      log_number,
      prepared_at: new Date(data.prepared_at).toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      material_receipt_id: data.material_receipt_id ?? null,
      manufacturer_lot: data.ref_lot ?? null,
      target_concentration: concDisplay,
      final_volume: volDisplay,
      solvent: data.diluent_name,
      preparation_steps: [],
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
      notes: data.notes ?? null,
      expiration_period_code: data.expiration_period_code ?? null,
      expiration_period_days: days,
      final_diluent: data.diluent_name,
      material_overridden: false,
      // Inherited from the parent primary, not re-derived — this is what
      // makes the traceability chain reach the vendor lot (Track A1 design
      // decision #3): represent this prep as diluted from a liquid stock of
      // known concentration (the parent), reusing ref_form: 'liquid' exactly
      // as it's already used for a liquid-stock primary.
      ref_material_name: data.ref_material_name ?? null,
      ref_lot: data.ref_lot ?? null,
      ref_form: "liquid",
      ref_purity_percent: data.ref_purity_percent ?? null,
      ref_concentration_mg_per_ml: data.stock_concentration_mg_per_ml,
      ref_molecular_weight: data.ref_molecular_weight ?? null,
      ref_receipt_date: data.ref_receipt_date ?? null,
      prep_type: "working",
      parent_prep_id: data.parent_prep_id,
      volume_remaining_ml: data.final_volume_ml,
      final_concentration_value: data.final_concentration_value,
      final_concentration_unit: data.final_concentration_unit,
      final_volume_ml: data.final_volume_ml,
      preparation_instructions: data.preparation_instructions,
    };

    const { data: row, error: insErr } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(logPayload as any)
      .select("id, log_number")
      .single();
    if (insErr) throw insErr;

    const { error: tErr } = await context.supabase
      .from("standard_preparation_targets")
      .insert({
        prep_id: row.id,
        row_no: 1,
        name: data.standard_name,
        target_concentration_mg_per_ml: data.target_concentration_mg_per_ml,
        target_concentration_unit: "mg/mL",
        target_volume_ml: data.final_volume_ml,
        calculated_mass_mg: null,
        calculated_volume_ml: data.final_volume_ml,
        notes: "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    if (tErr) throw tErr;

    // Decrement the parent by what this dilution actually drew from it.
    // Non-fatal: the working standard itself is already saved by this
    // point, and a failed decrement (e.g. the parent was discarded in the
    // meantime) shouldn't lose that — surface it as a warning instead.
    let parentUsageWarning: string | null = null;
    const { error: usageErr } = await context.supabase.rpc("record_standard_usage", {
      p_prep_id: data.parent_prep_id,
      p_withdrawn_ml: data.parent_withdrawal_ml,
      p_actor_id: context.userId,
      p_actor_name: data.analyst_name,
      p_purpose: "working_standard_prep",
      p_notes: `Drawn for working standard ${log_number}`,
    });
    if (usageErr) parentUsageWarning = usageErr.message;

    return {
      id: row.id as string,
      parent_usage_warning: parentUsageWarning,
      log_number: row.log_number as string,
    };
  });

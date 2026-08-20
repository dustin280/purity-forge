/**
 * Server function powering the guided Primary Standard: Aqueous prep flow
 * (Track A2): a liquid stock reference material, diluted to a target
 * concentration/volume — same computeDilution engine as Working Standard,
 * but the source is an external material receipt, not an internal prep, so
 * this is a primary (parent_prep_id stays null; ref_* comes straight from
 * the receipt, not inherited from anywhere).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDaysISO } from "./prep-shared.server";

const CONC_UNITS = ["mg/mL", "mg/L", "µg/mL", "µg/L"] as const;

const aqueousPayloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  // Source (material receipt)
  material_receipt_id: z.string().uuid(),
  ref_material_name: z.string().min(1).max(255),
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

export const createAqueousPrimary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => aqueousPayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const preparedDate = new Date(data.prepared_at).toISOString().slice(0, 10);

    const { data: synRes, error: synErr } = await context.supabase
      .rpc("next_syn_id", { p_user_token: data.user_token, p_day: preparedDate });
    if (synErr) throw synErr;
    const syn_id = synRes as unknown as string;

    const days = data.expiration_period_days ?? null;
    const expirationDate = days && data.prepared_at ? addDaysISO(data.prepared_at, days) : null;

    const concDisplay = `${data.final_concentration_value} ${data.final_concentration_unit}`;
    const volDisplay = `${data.final_volume_ml} mL`;

    const logPayload: Record<string, unknown> = {
      prepared_at: new Date(data.prepared_at).toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      material_receipt_id: data.material_receipt_id,
      manufacturer_lot: data.ref_lot ?? null,
      target_concentration: concDisplay,
      final_volume: volDisplay,
      solvent: data.diluent_name,
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
      notes: data.notes ?? null,
      expiration_period_code: data.expiration_period_code ?? null,
      expiration_period_days: days,
      final_diluent: data.diluent_name,
      material_overridden: false,
      ref_material_name: data.ref_material_name,
      ref_lot: data.ref_lot ?? null,
      ref_form: "liquid",
      ref_purity_percent: data.ref_purity_percent ?? null,
      ref_concentration_mg_per_ml: data.stock_concentration_mg_per_ml,
      ref_molecular_weight: data.ref_molecular_weight ?? null,
      ref_receipt_date: data.ref_receipt_date ?? null,
      syn_id,
      prep_type: "primary_aqueous",
      parent_prep_id: null,
      final_concentration_value: data.final_concentration_value,
      final_concentration_unit: data.final_concentration_unit,
      final_volume_ml: data.final_volume_ml,
      volume_remaining_ml: data.final_volume_ml,
      preparation_instructions: data.preparation_instructions,
    };

    const { data: row, error: insErr } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(logPayload as any)
      .select("id, log_number, syn_id")
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

    return {
      id: row.id as string,
      log_number: row.log_number as string,
      syn_id: (row.syn_id as string | null) ?? syn_id,
    };
  });

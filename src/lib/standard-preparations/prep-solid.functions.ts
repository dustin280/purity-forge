/**
 * Server functions powering the guided Primary Standard: Solid prep flow.
 * - createPrimaryStandardSolid: writes an approved standard prep log + target row
 * - listSolventOptions / addSolventOption: manage user-editable solvent catalog
 * - listModifierOptions / addModifierOption: manage user-editable modifier catalog
 * - searchMaterialReceiptsOldestFirst: name-prefix search over material receipts,
 *   ordered by received_at ASC, excluding expired items
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDaysISO } from "./prep-shared.server";

const diluentSolventSchema = z.object({
  name: z.string().min(1).max(120),
  percent: z.number().min(0).max(100),
  lot: z.string().max(255).nullable().optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  material_receipt_id: z.string().uuid().nullable().optional(),
});

const solidPayloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  // Source (solid material receipt)
  material_receipt_id: z.string().uuid().nullable(),
  ref_material_name: z.string().min(1).max(255),
  ref_lot: z.string().max(255).nullable().optional(),
  manufacturer_lot: z.string().max(255).nullable().optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  // Diluent
  diluent_solvents: z.array(diluentSolventSchema).min(1).max(4),
  modifier_type: z.string().max(120).nullable().optional(),
  modifier_percent: z.number().nullable().optional(),
  modifier_material_receipt_id: z.string().uuid().nullable().optional(),
  // Concentration
  standard_name: z.string().min(1).max(255),
  final_concentration_value: z.number().positive(),
  final_concentration_unit: z.enum(["mg/mL", "mg/L", "µg/mL", "µg/L"]),
  final_volume_ml: z.number().positive(),
  // Storage
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  preparation_instructions: z.string().max(10000),
  calculated_mass_mg: z.number().nullable(),
  target_concentration_mg_per_ml: z.number().positive(),
});

export const createPrimaryStandardSolid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => solidPayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const preparedDate = new Date(data.prepared_at).toISOString().slice(0, 10);

    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "STDP", p_source_table: "standard_preparation_logs", p_source_id: rowId, p_date: preparedDate, p_created_by: context.userId });
    if (docErr) throw docErr;
    const log_number = docNumber as unknown as string;

    const days = data.expiration_period_days ?? null;
    const expirationDate = days && data.prepared_at ? addDaysISO(data.prepared_at, days) : null;

    const concDisplay = `${data.final_concentration_value} ${data.final_concentration_unit}`;
    const volDisplay = `${data.final_volume_ml} mL`;
    const solventSummary = data.diluent_solvents
      .map(s => `${s.percent}% ${s.name}`)
      .join(" / ")
      + (data.modifier_type && data.modifier_percent
          ? ` + ${data.modifier_percent}% ${data.modifier_type}`
          : "");

    const logPayload: Record<string, unknown> = {
      id: rowId,
      log_number,
      prepared_at: new Date(data.prepared_at).toISOString(),
      analyst_name: data.analyst_name,
      analyst_id: context.userId,
      created_by: context.userId,
      standard_name: data.standard_name,
      material_receipt_id: data.material_receipt_id,
      manufacturer_lot: data.manufacturer_lot ?? null,
      target_concentration: concDisplay,
      final_volume: volDisplay,
      solvent: solventSummary,
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
      final_diluent: solventSummary,
      modifier_percent: data.modifier_percent ?? null,
      modifier_type: data.modifier_type ?? null,
      modifier_material_receipt_id: data.modifier_material_receipt_id ?? null,
      material_overridden: false,
      ref_material_name: data.ref_material_name,
      ref_lot: data.ref_lot ?? null,
      ref_form: "solid",
      ref_purity_percent: data.ref_purity_percent ?? null,
      ref_molecular_weight: data.ref_molecular_weight ?? null,
      ref_receipt_date: data.ref_receipt_date ?? null,
      prep_type: "primary_solid",
      diluent_solvents: data.diluent_solvents,
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
        target_concentration_unit: data.final_concentration_unit.includes("mg/mL")
          ? "mg/mL"
          : data.final_concentration_unit.includes("mg/L")
            ? "mg/L"
            : "mg/mL",
        target_volume_ml: data.final_volume_ml,
        calculated_mass_mg: data.calculated_mass_mg,
        calculated_volume_ml: data.final_volume_ml,
        notes: "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    if (tErr) throw tErr;

    return {
      id: row.id as string,
      log_number: row.log_number as string,
    };
  });

export const listSolventOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("solvent_options")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string }>;
  });

export const addSolventOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("solvent_options")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ name: data.name.trim(), created_by: context.userId } as any)
      .select("id, name")
      .single();
    if (error) throw error;
    return row as { id: string; name: string };
  });

export const listModifierOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("modifier_options")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string }>;
  });

export const addModifierOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("modifier_options")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ name: data.name.trim(), created_by: context.userId } as any)
      .select("id, name")
      .single();
    if (error) throw error;
    return row as { id: string; name: string };
  });

export const searchMaterialReceiptsOldestFirst = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    q: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const today = new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("material_receipts")
      .select("id, receipt_number, internal_lot, manufacturer_lot, material_name, manufacturer, received_at, purity_percent, molecular_weight, expiry_date")
      .or(`expiry_date.is.null,expiry_date.gte.${today}`)
      .order("received_at", { ascending: true })
      .limit(data.limit ?? 20);
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `material_name.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
          `internal_lot.ilike.${term}`,
          `receipt_number.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      receipt_number: string;
      internal_lot: string | null;
      manufacturer_lot: string | null;
      material_name: string;
      manufacturer: string | null;
      received_at: string;
      purity_percent: number | null;
      molecular_weight: number | null;
      expiry_date: string | null;
    }>;
  });

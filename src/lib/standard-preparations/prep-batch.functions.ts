/**
 * Batch-mode server functions: create N standard prep logs in one go (each
 * with its own SYN ID, sharing a batch_group_id) and fetch all rows in a
 * batch group.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  batchPayloadSchema,
  emptyToNull,
  addDaysISO,
  type StandardPrepRow,
} from "./prep-shared.server";

export const createStandardPreparationBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchPayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { targets, user_token, batch_label, ...shared } = data;
    const preparedDate = new Date(shared.prepared_at).toISOString().slice(0, 10);
    const days = shared.expiration_period_days ?? null;
    const expirationDate = days && shared.prepared_at ? addDaysISO(shared.prepared_at, days) : null;
    const batchGroupId = crypto.randomUUID();

    const created: Array<{ id: string; log_number: string; syn_id: string | null; standard_name: string }> = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const { data: synRes, error: synErr } = await context.supabase
        .rpc("next_syn_id", { p_user_token: user_token, p_day: preparedDate });
      if (synErr) throw synErr;
      const syn_id = synRes as unknown as string;

      const standardName = t.name?.trim() || batch_label?.trim() || `Standard ${i + 1}`;
      const concDisplay = t.target_concentration_mg_per_ml != null ? `${t.target_concentration_mg_per_ml} mg/mL` : null;
      const volDisplay = t.target_volume_ml != null ? `${t.target_volume_ml} mL` : null;

      const logPayload = emptyToNull({
        prepared_at: new Date(shared.prepared_at).toISOString(),
        analyst_name: shared.analyst_name,
        analyst_id: context.userId,
        created_by: context.userId,
        standard_name: standardName,
        material_receipt_id: shared.material_receipt_id ?? null,
        manufacturer_lot: shared.manufacturer_lot ?? null,
        target_concentration: concDisplay,
        final_volume: volDisplay,
        solvent: shared.solvent ?? null,
        preparation_steps: shared.preparation_steps ?? [],
        mixing_details: shared.mixing_details ?? null,
        appearance_notes: shared.appearance_notes ?? null,
        expiration_date: expirationDate,
        storage_condition: shared.storage_condition ?? null,
        storage_location: shared.storage_location ?? null,
        container_label: syn_id,
        notes: [batch_label ? `Batch: ${batch_label}` : "", t.notes ?? "", shared.notes ?? ""].filter(Boolean).join("\n") || null,
        expiration_period_code: shared.expiration_period_code ?? null,
        expiration_period_days: days,
        initial_solvent: shared.initial_solvent ?? null,
        final_diluent: shared.final_diluent ?? null,
        modifier_percent: shared.modifier_percent ?? null,
        material_overridden: shared.material_overridden ?? false,
        ref_material_name: shared.ref_material_name ?? null,
        ref_lot: shared.ref_lot ?? null,
        ref_purity_percent: shared.ref_purity_percent ?? null,
        ref_molecular_weight: shared.ref_molecular_weight ?? null,
        ref_receipt_date: shared.ref_receipt_date ?? null,
        syn_id,
        batch_group_id: batchGroupId,
      }) as Record<string, unknown>;

      const { data: row, error: insErr } = await context.supabase
        .from("standard_preparation_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(logPayload as any)
        .select("id, log_number, syn_id, standard_name")
        .single();
      if (insErr) throw insErr;

      const { error: tErr } = await context.supabase
        .from("standard_preparation_targets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          prep_id: row.id,
          row_no: 1,
          name: standardName,
          target_concentration_mg_per_ml: t.target_concentration_mg_per_ml,
          target_volume_ml: t.target_volume_ml,
          calculated_mass_mg: t.calculated_mass_mg,
          calculated_volume_ml: t.target_volume_ml,
          notes: t.notes ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (tErr) throw tErr;

      created.push({
        id: row.id as string,
        log_number: row.log_number as string,
        syn_id: (row.syn_id as string | null) ?? syn_id,
        standard_name: row.standard_name as string,
      });
    }

    return { batch_group_id: batchGroupId, rows: created };
  });

export const getStandardPreparationBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("standard_preparation_logs")
      .select("*, material_receipt:material_receipts(id, receipt_number, internal_lot, manufacturer_lot, material_name)")
      .eq("batch_group_id", data.group_id)
      .order("syn_id", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as Array<StandardPrepRow & {
      material_receipt: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string } | null;
    }>;
  });
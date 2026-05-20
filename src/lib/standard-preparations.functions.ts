import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PREP_STATUSES = ["draft", "reviewed", "approved"] as const;
export const PREP_ATTACHMENT_KINDS = ["weighing", "label", "photo", "sequence", "coa", "other"] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];
export type PrepAttachmentKind = (typeof PREP_ATTACHMENT_KINDS)[number];

export interface PrepStep {
  step_no: number;
  description: string;
  amount: string;
  instrument_id: string;
  time: string;
}

export interface PrepTarget {
  row_no: number;
  name: string;
  target_concentration_mg_per_ml: number | null;
  target_volume_ml: number | null;
  calculated_mass_mg: number | null;
  calculated_volume_ml: number | null;
  notes: string;
}

export interface PrepTargetRow extends PrepTarget {
  id: string;
  prep_id: string;
  created_at: string;
}

export interface StandardPrepRow {
  id: string;
  log_number: string;
  syn_id: string | null;
  batch_group_id: string | null;
  prepared_at: string;
  analyst_id: string | null;
  analyst_name: string;
  standard_name: string;
  material_receipt_id: string | null;
  manufacturer_lot: string | null;
  target_concentration: string | null;
  final_volume: string | null;
  solvent: string | null;
  preparation_steps: PrepStep[];
  mixing_details: string | null;
  appearance_notes: string | null;
  expiration_date: string | null;
  storage_condition: string | null;
  storage_location: string | null;
  container_label: string | null;
  status: PrepStatus;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  approver_id: string | null;
  approver_name: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expiration_period_code: string | null;
  expiration_period_days: number | null;
  initial_solvent: string | null;
  final_diluent: string | null;
  modifier_percent: number | null;
  material_overridden: boolean;
  ref_material_name: string | null;
  ref_lot: string | null;
  ref_purity_percent: number | null;
  ref_molecular_weight: number | null;
  ref_receipt_date: string | null;
}

export interface PrepAttachmentRow {
  id: string;
  log_id: string;
  kind: PrepAttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const stepSchema = z.object({
  step_no: z.number().int().min(1).max(999),
  description: z.string().max(2000),
  amount: z.string().max(255),
  instrument_id: z.string().max(255),
  time: z.string().max(255),
});

const targetSchema = z.object({
  row_no: z.number().int().min(1).max(999),
  name: z.string().max(255),
  target_concentration_mg_per_ml: z.number().nullable(),
  target_volume_ml: z.number().nullable(),
  calculated_mass_mg: z.number().nullable(),
  calculated_volume_ml: z.number().nullable(),
  notes: z.string().max(2000),
});

const payloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  standard_name: z.string().min(1).max(255),
  material_receipt_id: z.string().uuid().nullable().optional(),
  manufacturer_lot: z.string().max(255).nullable().optional(),
  target_concentration: z.string().max(255).nullable().optional(),
  final_volume: z.string().max(255).nullable().optional(),
  solvent: z.string().max(500).nullable().optional(),
  preparation_steps: z.array(stepSchema).max(100).optional(),
  mixing_details: z.string().max(2000).nullable().optional(),
  appearance_notes: z.string().max(2000).nullable().optional(),
  expiration_date: z.string().nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  container_label: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  initial_solvent: z.string().max(500).nullable().optional(),
  final_diluent: z.string().max(500).nullable().optional(),
  modifier_percent: z.number().nullable().optional(),
  material_overridden: z.boolean().optional(),
  ref_material_name: z.string().max(255).nullable().optional(),
  ref_lot: z.string().max(255).nullable().optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  targets: z.array(targetSchema).max(500).optional(),
});

function emptyToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out as T;
}

export const listStandardPreparations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      q: z.string().nullable().optional(),
      status: z.enum(PREP_STATUSES).nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("standard_preparation_logs")
      .select("*, material_receipt:material_receipts(receipt_number, internal_lot)")
      .order("prepared_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("prepared_at", data.from);
    if (data.to) q = q.lte("prepared_at", data.to + "T23:59:59");
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `log_number.ilike.${term}`,
          `syn_id.ilike.${term}`,
          `standard_name.ilike.${term}`,
          `analyst_name.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getStandardPreparation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ data: log, error: e1 }, { data: atts, error: e2 }, { data: targets, error: e3 }] = await Promise.all([
      context.supabase
        .from("standard_preparation_logs")
        .select("*, material_receipt:material_receipts(id, receipt_number, internal_lot, manufacturer_lot, material_name)")
        .eq("id", data.id)
        .single(),
      context.supabase
        .from("standard_preparation_attachments")
        .select("*")
        .eq("log_id", data.id)
        .order("uploaded_at", { ascending: false }),
      context.supabase
        .from("standard_preparation_targets")
        .select("*")
        .eq("prep_id", data.id)
        .order("row_no", { ascending: true }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    return {
      log: log as unknown as StandardPrepRow & { material_receipt: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string } | null },
      attachments: (atts ?? []) as PrepAttachmentRow[],
      targets: (targets ?? []) as PrepTargetRow[],
    };
  });

export const createStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { targets, ...rest } = data;
    const payload = emptyToNull({
      ...rest,
      analyst_id: context.userId,
      created_by: context.userId,
      preparation_steps: rest.preparation_steps ?? [],
    });
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single();
    if (error) throw error;
    if (targets && targets.length > 0) {
      const inserts = targets.map(t => ({ ...t, prep_id: row.id }));
      const { error: tErr } = await context.supabase
        .from("standard_preparation_targets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(inserts as any);
      if (tErr) throw tErr;
    }
    return row as unknown as StandardPrepRow;
  });

export const updateStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: payloadSchema.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { targets, ...patch } = data.patch;
    const payload = emptyToNull(patch) as Record<string, unknown>;
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    if (targets) {
      // Replace strategy: delete existing targets then re-insert.
      const { error: dErr } = await context.supabase
        .from("standard_preparation_targets")
        .delete()
        .eq("prep_id", data.id);
      if (dErr) throw dErr;
      if (targets.length > 0) {
        const inserts = targets.map(t => ({ ...t, prep_id: data.id }));
        const { error: tErr } = await context.supabase
          .from("standard_preparation_targets")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(inserts as any);
        if (tErr) throw tErr;
      }
    }
    return row as unknown as StandardPrepRow;
  });

export const deleteStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: atts } = await context.supabase
      .from("standard_preparation_attachments")
      .select("file_path")
      .eq("log_id", data.id);
    const { error } = await context.supabase
      .from("standard_preparation_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    const paths = (atts ?? []).map((a: { file_path: string }) => a.file_path);
    if (paths.length > 0) {
      await context.supabase.storage.from("standard-preparations").remove(paths);
    }
    return { ok: true };
  });

export const transitionStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      target: z.enum(["reviewed", "approved", "draft"]),
      actor_name: z.string().min(1).max(255),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { status: data.target };
    if (data.target === "reviewed") {
      patch.reviewer_id = context.userId;
      patch.reviewer_name = data.actor_name;
      patch.reviewed_at = new Date().toISOString();
    } else if (data.target === "approved") {
      patch.approver_id = context.userId;
      patch.approver_name = data.actor_name;
      patch.approved_at = new Date().toISOString();
    } else if (data.target === "draft") {
      patch.reviewer_id = null;
      patch.reviewer_name = null;
      patch.reviewed_at = null;
      patch.approver_id = null;
      patch.approver_name = null;
      patch.approved_at = null;
    }
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row as unknown as StandardPrepRow;
  });

export const recordPrepAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      log_id: z.string().uuid(),
      kind: z.enum(PREP_ATTACHMENT_KINDS),
      file_path: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(500),
      content_type: z.string().max(255).nullable().optional(),
      size_bytes: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("standard_preparation_attachments")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row as PrepAttachmentRow;
  });

export const deletePrepAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("standard_preparation_attachments")
      .select("file_path")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase
      .from("standard_preparation_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    if (row?.file_path) {
      await context.supabase.storage.from("standard-preparations").remove([row.file_path]);
    }
    return { ok: true };
  });

export const signPrepAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("standard-preparations")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const listStandardSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("standard_suggestions")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      name: string;
      typical_concentration: string | null;
      typical_solvent: string | null;
    }>;
  });

export const searchMaterialReceiptsForLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    q: z.string().nullable().optional(),
    approved_only: z.boolean().optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("material_receipts")
      .select("id, receipt_number, internal_lot, manufacturer_lot, material_name, received_at, purity_percent, molecular_weight, shelf_life_months, expiry_date, approved_at, quarantine_status")
      .order("received_at", { ascending: false })
      .limit(20);
    if (data.approved_only) {
      q = q.not("approved_at", "is", null).eq("quarantine_status", "released");
    }
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `receipt_number.ilike.${term}`,
          `material_name.ilike.${term}`,
          `internal_lot.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listPrepsForReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ receipt_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, syn_id, batch_group_id, standard_name, analyst_name, prepared_at, expiration_date, status")
      .eq("material_receipt_id", data.receipt_id)
      .order("prepared_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      log_number: string;
      syn_id: string | null;
      batch_group_id: string | null;
      standard_name: string;
      analyst_name: string;
      prepared_at: string;
      expiration_date: string | null;
      status: PrepStatus;
    }>;
  });

// ---------- BATCH CREATE ----------

const batchTargetSchema = z.object({
  name: z.string().max(255),
  target_concentration_mg_per_ml: z.number().nullable(),
  target_volume_ml: z.number().nullable(),
  calculated_mass_mg: z.number().nullable(),
  notes: z.string().max(2000),
});

const batchPayloadSchema = z.object({
  // shared
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  batch_label: z.string().max(255).nullable().optional(),
  material_receipt_id: z.string().uuid().nullable().optional(),
  manufacturer_lot: z.string().max(255).nullable().optional(),
  solvent: z.string().max(500).nullable().optional(),
  preparation_steps: z.array(stepSchema).max(100).optional(),
  mixing_details: z.string().max(2000).nullable().optional(),
  appearance_notes: z.string().max(2000).nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  initial_solvent: z.string().max(500).nullable().optional(),
  final_diluent: z.string().max(500).nullable().optional(),
  modifier_percent: z.number().nullable().optional(),
  material_overridden: z.boolean().optional(),
  ref_material_name: z.string().max(255).nullable().optional(),
  ref_lot: z.string().max(255).nullable().optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  // children
  targets: z.array(batchTargetSchema).min(1).max(200),
});

function addDaysISO(dateInput: string, days: number): string {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

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
      // 1. allocate next SYN ID (atomic per-day counter)
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

      // Snapshot the calculator row as a single target for traceability
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
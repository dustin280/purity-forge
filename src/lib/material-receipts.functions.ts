import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MATERIAL_TYPES = ["controlled", "uncontrolled"] as const;
export const QUARANTINE_STATUSES = ["quarantine", "released", "rejected"] as const;
export const ATTACHMENT_KINDS = ["coa", "sds", "packing_slip", "label", "photo", "other"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type QuarantineStatus = (typeof QUARANTINE_STATUSES)[number];
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface MaterialReceiptRow {
  id: string;
  receipt_number: string;
  material_type: MaterialType;
  received_at: string;
  received_by: string | null;
  receiver_name: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  po_number: string | null;
  notes: string | null;
  freight_tracking_number: string | null;
  purpose: string | null;
  manufacturer: string | null;
  manufacturer_lot: string | null;
  catalog_number: string | null;
  expiry_date: string | null;
  container_details: string | null;
  coa_attached: boolean;
  sds_attached: boolean;
  visual_inspection: string | null;
  visual_inspection_notes: string | null;
  temperature_on_receipt: number | null;
  internal_lot: string | null;
  storage_location: string | null;
  quarantine_status: QuarantineStatus;
  qc_pass: boolean | null;
  qc_results: string | null;
  qc_analyst: string | null;
  qc_date: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approver_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  purity_percent: number | null;
  molecular_weight: number | null;
  shelf_life_months: number | null;
}

export interface AttachmentRow {
  id: string;
  receipt_id: string;
  kind: AttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const receiptPayloadSchema = z.object({
  material_type: z.enum(MATERIAL_TYPES),
  received_at: z.string().min(1),
  receiver_name: z.string().min(1).max(255),
  material_name: z.string().min(1).max(255),
  quantity: z.number().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  po_number: z.string().max(100).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  freight_tracking_number: z.string().max(255).nullable().optional(),
  purpose: z.string().max(500).nullable().optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  manufacturer_lot: z.string().max(100).nullable().optional(),
  catalog_number: z.string().max(100).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  container_details: z.string().max(500).nullable().optional(),
  coa_attached: z.boolean().optional(),
  sds_attached: z.boolean().optional(),
  visual_inspection: z.string().max(100).nullable().optional(),
  visual_inspection_notes: z.string().max(2000).nullable().optional(),
  temperature_on_receipt: z.number().nullable().optional(),
  internal_lot: z.string().max(100).nullable().optional(),
  storage_location: z.string().max(255).nullable().optional(),
  quarantine_status: z.enum(QUARANTINE_STATUSES).optional(),
  qc_pass: z.boolean().nullable().optional(),
  qc_results: z.string().max(2000).nullable().optional(),
  qc_analyst: z.string().max(255).nullable().optional(),
  qc_date: z.string().nullable().optional(),
  purity_percent: z.number().nullable().optional(),
  molecular_weight: z.number().nullable().optional(),
  shelf_life_months: z.number().int().nullable().optional(),
});

function emptyToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out as T;
}

export const listMaterialReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      q: z.string().optional().nullable(),
      material_type: z.enum(MATERIAL_TYPES).optional().nullable(),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("material_receipts")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(500);
    if (data.material_type) q = q.eq("material_type", data.material_type);
    if (data.from) q = q.gte("received_at", data.from);
    if (data.to) q = q.lte("received_at", data.to + "T23:59:59");
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `receipt_number.ilike.${term}`,
          `material_name.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
          `internal_lot.ilike.${term}`,
          `supplier.ilike.${term}`,
          `freight_tracking_number.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as MaterialReceiptRow[];
  });

export const getMaterialReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ data: receipt, error: err1 }, { data: atts, error: err2 }] = await Promise.all([
      context.supabase.from("material_receipts").select("*").eq("id", data.id).single(),
      context.supabase
        .from("material_receipt_attachments")
        .select("*")
        .eq("receipt_id", data.id)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (err1) throw err1;
    if (err2) throw err2;
    return {
      receipt: receipt as MaterialReceiptRow,
      attachments: (atts ?? []) as AttachmentRow[],
    };
  });

export const createMaterialReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => receiptPayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = emptyToNull({
      ...data,
      received_by: context.userId,
      created_by: context.userId,
    });
    const { data: row, error } = await context.supabase
      .from("material_receipts")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row as MaterialReceiptRow;
  });

export const updateMaterialReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: receiptPayloadSchema.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload = emptyToNull(data.patch);
    const { data: row, error } = await context.supabase
      .from("material_receipts")
      .update(payload)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row as MaterialReceiptRow;
  });

export const deleteMaterialReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // pull file paths to clean up storage as well
    const { data: atts } = await context.supabase
      .from("material_receipt_attachments")
      .select("file_path")
      .eq("receipt_id", data.id);
    const { error } = await context.supabase.from("material_receipts").delete().eq("id", data.id);
    if (error) throw error;
    const paths = (atts ?? []).map((a: { file_path: string }) => a.file_path);
    if (paths.length > 0) {
      await context.supabase.storage.from("material-receipts").remove(paths);
    }
    return { ok: true };
  });

export const approveMaterialReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      approver_name: z.string().min(1).max(255),
      qc_pass: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("material_receipts")
      .update({
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
        approver_name: data.approver_name,
        qc_pass: data.qc_pass,
        quarantine_status: data.qc_pass ? "released" : "rejected",
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row as MaterialReceiptRow;
  });

export const recordAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      receipt_id: z.string().uuid(),
      kind: z.enum(ATTACHMENT_KINDS),
      file_path: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(500),
      content_type: z.string().max(255).nullable().optional(),
      size_bytes: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("material_receipt_attachments")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    // mirror coa/sds flags
    if (data.kind === "coa" || data.kind === "sds") {
      await context.supabase
        .from("material_receipts")
        .update(data.kind === "coa" ? { coa_attached: true } : { sds_attached: true })
        .eq("id", data.receipt_id);
    }
    return row as AttachmentRow;
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("material_receipt_attachments")
      .select("file_path")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase
      .from("material_receipt_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    if (row?.file_path) {
      await context.supabase.storage.from("material-receipts").remove([row.file_path]);
    }
    return { ok: true };
  });

export const signAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("material-receipts")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const listMaterialSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("material_suggestions")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      material_type: MaterialType;
      name: string;
      manufacturer: string | null;
      catalog_number: string | null;
    }>;
  });
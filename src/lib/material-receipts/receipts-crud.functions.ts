import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATERIAL_TYPES,
  receiptPayloadSchema,
  emptyToNull,
  type MaterialReceiptRow,
  type AttachmentRow,
} from "./receipts-shared.server";

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
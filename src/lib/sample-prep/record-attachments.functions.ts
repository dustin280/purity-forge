/**
 * Server functions for attachments on sample-prep records (Phase 1E).
 * Mirrors the standard-prep attachment pattern: insert metadata,
 * delete + storage cleanup, and short-lived signed URLs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SP_ATTACHMENT_KINDS = [
  "weighing",
  "label",
  "photo",
  "sequence",
  "coa",
  "other",
] as const;
export type SpAttachmentKind = (typeof SP_ATTACHMENT_KINDS)[number];

export interface SpAttachmentRow {
  id: string;
  record_id: string;
  kind: SpAttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const listRecordAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ record_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("sp_preparation_attachments")
      .select("*")
      .eq("record_id", data.record_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as unknown as SpAttachmentRow[];
  });

export const recordRecordAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      record_id: z.string().uuid(),
      kind: z.enum(SP_ATTACHMENT_KINDS),
      file_path: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(500),
      content_type: z.string().max(255).nullable().optional(),
      size_bytes: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("sp_preparation_attachments")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as SpAttachmentRow;
  });

export const deleteRecordAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("sp_preparation_attachments")
      .select("file_path")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase
      .from("sp_preparation_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    if (row?.file_path) {
      await context.supabase.storage.from("sample-preparations").remove([row.file_path]);
    }
    return { ok: true };
  });

export const signRecordAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("sample-preparations")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });
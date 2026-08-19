/**
 * Attachments for non-chromatography test results (heavy-metals "attach sub
 * report" now; any future analyte later). Mirrors the sample-prep
 * attachment pattern (src/lib/sample-prep/record-attachments.functions.ts):
 * insert metadata, delete + storage cleanup, short-lived signed URLs. Keyed
 * to test_id rather than a result row's id, so a report file can be dropped
 * in the moment it arrives without forcing an empty result to exist first.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const NONCHROM_ATTACHMENT_KINDS = ["lab_report", "coa", "other"] as const;
export type NonchromAttachmentKind = (typeof NONCHROM_ATTACHMENT_KINDS)[number];

export interface NonchromAttachmentRow {
  id: string;
  test_id: string;
  kind: NonchromAttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const listNonchromAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ test_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("nonchrom_test_attachments")
      .select("*")
      .eq("test_id", data.test_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as unknown as NonchromAttachmentRow[];
  });

export const recordNonchromAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      test_id: z.string().uuid(),
      kind: z.enum(NONCHROM_ATTACHMENT_KINDS),
      file_path: z.string().min(1).max(1000),
      file_name: z.string().min(1).max(500),
      content_type: z.string().max(255).nullable().optional(),
      size_bytes: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("nonchrom_test_attachments")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as NonchromAttachmentRow;
  });

export const deleteNonchromAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("nonchrom_test_attachments")
      .select("file_path")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase
      .from("nonchrom_test_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    if (row?.file_path) {
      await context.supabase.storage.from("nonchrom-tests").remove([row.file_path]);
    }
    return { ok: true };
  });

export const signNonchromAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("nonchrom-tests")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

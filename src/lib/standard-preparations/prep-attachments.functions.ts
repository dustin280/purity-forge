/**
 * Server functions for attachments on standard prep logs (insert metadata,
 * delete + storage cleanup, signed-URL minting).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREP_ATTACHMENT_KINDS, type PrepAttachmentRow } from "./prep-shared.server";

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
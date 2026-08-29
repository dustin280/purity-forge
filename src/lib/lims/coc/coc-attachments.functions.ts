import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordCocAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      coc_id: z.string().uuid(),
      file_path: z.string().min(1).max(1024),
      file_name: z.string().min(1).max(255),
      content_type: z.string().max(127).nullable().optional(),
      size_bytes: z.number().int().nonnegative().nullable().optional(),
      line_item_index: z.number().int().nullable().optional(),
      /** Which vial within the line item, for per-vial photos. */
      vial_no: z.number().int().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("coc_attachments").insert({
      coc_id: data.coc_id,
      file_path: data.file_path,
      file_name: data.file_name,
      content_type: data.content_type ?? null,
      size_bytes: data.size_bytes ?? null,
      line_item_index: data.line_item_index ?? null,
      vial_no: data.vial_no ?? null,
      uploaded_by: userId,
    }).select().single();
    if (error) throw error;
    return row;
  });

export const listCocAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ coc_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("coc_attachments").select("*")
      .eq("coc_id", data.coc_id)
      .order("uploaded_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const deleteCocAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("coc_attachments").select("file_path").eq("id", data.id).maybeSingle();
    if (row?.file_path) {
      await supabase.storage.from("coc-attachments").remove([row.file_path]);
    }
    const { error } = await supabase.from("coc_attachments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const signedCocAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ file_path: z.string().min(1).max(1024), expires_in: z.number().int().min(60).max(3600).default(600) }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("coc-attachments")
      .createSignedUrl(data.file_path, data.expires_in);
    if (error) throw error;
    return { url: signed.signedUrl };
  });
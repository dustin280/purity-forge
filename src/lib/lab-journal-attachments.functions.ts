/**
 * Server functions for Lab Journal file attachments.
 * RLS keeps each row scoped to its owner (or admin).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LabJournalAttachment {
  id: string;
  entry_id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const BUCKET = "lab-journal-attachments";

export const listJournalAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ entry_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("lab_journal_attachments")
      .select("*")
      .eq("entry_id", data.entry_id)
      .order("uploaded_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as LabJournalAttachment[];
  });

export const recordJournalAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entry_id: z.string().uuid(),
        file_path: z.string().min(1).max(1024),
        file_name: z.string().min(1).max(255),
        content_type: z.string().max(255).nullable().optional(),
        size_bytes: z.number().int().nonnegative().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lab_journal_attachments")
      .insert({
        entry_id: data.entry_id,
        user_id: context.userId,
        uploaded_by: context.userId,
        file_path: data.file_path,
        file_name: data.file_name,
        content_type: data.content_type ?? null,
        size_bytes: data.size_bytes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as LabJournalAttachment;
  });

export const signJournalAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lab_journal_attachments")
      .select("file_path,file_name")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: signed, error: sErr } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 60 * 10);
    if (sErr) throw sErr;
    return { url: signed.signedUrl, file_name: row.file_name };
  });

export const deleteJournalAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error: fErr } = await context.supabase
      .from("lab_journal_attachments")
      .select("file_path")
      .eq("id", data.id)
      .single();
    if (fErr) throw fErr;
    await context.supabase.storage.from(BUCKET).remove([row.file_path]);
    const { error } = await context.supabase
      .from("lab_journal_attachments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
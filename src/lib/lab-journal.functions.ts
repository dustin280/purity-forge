/**
 * Server functions for the personal Lab Journal: list/create/update/delete
 * private journal entries. RLS scopes each entry to its author (or admin).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LabJournalEntry {
  id: string;
  entry_number: string;
  user_id: string;
  user_name: string;
  entry_at: string;
  title: string | null;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const tagSchema = z
  .array(z.string().min(1).max(40))
  .max(20)
  .optional();

const createSchema = z.object({
  entry_at: z.string().min(1),
  user_name: z.string().min(1).max(255),
  title: z.string().max(200).nullable().optional(),
  body: z.string().max(50000),
  tags: tagSchema,
});

const updateSchema = z.object({
  id: z.string().uuid(),
  entry_at: z.string().min(1).optional(),
  title: z.string().max(200).nullable().optional(),
  body: z.string().max(50000).optional(),
  tags: tagSchema,
});

export const listLabJournalEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lab_journal_entries")
      .select("*")
      .order("entry_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as LabJournalEntry[];
  });

export const createLabJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const rowId = crypto.randomUUID();
    const entryDate = new Date(data.entry_at).toISOString().slice(0, 10);
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "JRNL", p_source_table: "lab_journal_entries", p_source_id: rowId, p_date: entryDate, p_created_by: context.userId });
    if (docErr) throw docErr;

    const { data: row, error } = await context.supabase
      .from("lab_journal_entries")
      .insert({
        id: rowId,
        entry_number: docNumber,
        entry_at: data.entry_at,
        user_name: data.user_name,
        title: data.title || null,
        body: data.body,
        tags: data.tags ?? [],
        user_id: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as LabJournalEntry;
  });

export const updateLabJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const cleanPatch: {
      entry_at?: string;
      title?: string | null;
      body?: string;
      tags?: string[];
    } = {};
    if (patch.entry_at !== undefined) cleanPatch.entry_at = patch.entry_at;
    if (patch.title !== undefined) cleanPatch.title = patch.title || null;
    if (patch.body !== undefined) cleanPatch.body = patch.body;
    if (patch.tags !== undefined) cleanPatch.tags = patch.tags;
    const { data: row, error } = await context.supabase
      .from("lab_journal_entries")
      .update(cleanPatch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as unknown as LabJournalEntry;
  });

export const deleteLabJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("lab_journal_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
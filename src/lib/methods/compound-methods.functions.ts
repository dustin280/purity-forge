/**
 * Compound Methods -- a place to start recording per-compound method
 * details (acquisition/processing method, gradient, temp, injection volume,
 * special handling, notes) before any of it is wired into anything else.
 *
 * Dustin, 2026-09-02: "This doesn't need to connect to anything yet, I just
 * want to start recording what I am doing so information isn't lost." This
 * is deliberately its own table, not a write path onto compounds.
 * acquisition_method/processing_method -- those two columns are already
 * live in run-list generation (generate.functions.ts builds the actual
 * sequence CSV's method paths from them), and this feature isn't meant to
 * touch that yet.
 *
 * One compound has at most one open DRAFT (confirmed_at is null) at a time
 * -- the row every field edit saves into. "Confirm Current Method" freezes
 * that row (stamps confirmed_at) and immediately opens a new draft seeded
 * from it, so the next round of edits has somewhere to land without
 * starting from blank. History is just every confirmed row, newest first;
 * the newest one IS "the primary working version" -- no separate flag
 * needed since confirming always produces exactly one new newest row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CompoundMethodVersion {
  id: string;
  compound_id: string;
  acquisition_method: string | null;
  processing_method: string | null;
  gradient: string | null;
  column_temperature_c: number | null;
  injection_volume_ul: number | null;
  special_handling: string | null;
  notes: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, compound_id, acquisition_method, processing_method, gradient, column_temperature_c, "
  + "injection_volume_ul, special_handling, notes, confirmed_at, confirmed_by_name, created_by_name, "
  + "created_at, updated_at";

export const getCompoundMethodState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ compound_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("compound_method_versions")
      .select(COLUMNS)
      .eq("compound_id", data.compound_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const all = (rows ?? []) as unknown as CompoundMethodVersion[];
    return {
      draft: all.find(r => !r.confirmed_at) ?? null,
      // Newest confirmed first -- history[0], when it exists, is the
      // primary working version.
      history: all.filter(r => r.confirmed_at).sort((a, b) => (a.confirmed_at! < b.confirmed_at! ? 1 : -1)),
    };
  });

const fieldsSchema = z.object({
  acquisition_method: z.string().max(255).nullable().optional(),
  processing_method: z.string().max(255).nullable().optional(),
  gradient: z.string().max(4000).nullable().optional(),
  column_temperature_c: z.number().nullable().optional(),
  injection_volume_ul: z.number().nullable().optional(),
  special_handling: z.string().max(4000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

/**
 * Upserts the one open draft for a compound. Called on every field blur --
 * cheap enough, and it's what lets "just start typing" be the whole
 * interaction instead of a save button per field.
 */
export const saveCompoundMethodDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      compound_id: z.string().uuid(),
      draft_id: z.string().uuid().nullable(),
      analyst_name: z.string().max(255),
      fields: fieldsSchema,
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.draft_id) {
      const { data: row, error } = await context.supabase
        .from("compound_method_versions")
        .update(data.fields)
        .eq("id", data.draft_id)
        .is("confirmed_at", null) // never edit a version that's already been confirmed
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return row as unknown as CompoundMethodVersion;
    }
    const { data: row, error } = await context.supabase
      .from("compound_method_versions")
      .insert({
        compound_id: data.compound_id,
        created_by: context.userId,
        created_by_name: data.analyst_name,
        ...data.fields,
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return row as unknown as CompoundMethodVersion;
  });

/**
 * Freezes the current draft as a declared version and opens the next draft
 * seeded from it. Requires an existing draft -- nothing to confirm if
 * nobody has typed anything yet.
 */
export const confirmCompoundMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ draft_id: z.string().uuid(), analyst_name: z.string().max(255) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: confirmed, error: confirmErr } = await context.supabase
      .from("compound_method_versions")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: context.userId, confirmed_by_name: data.analyst_name })
      .eq("id", data.draft_id)
      .is("confirmed_at", null)
      .select(COLUMNS)
      .single();
    if (confirmErr) throw confirmErr;
    const c = confirmed as unknown as CompoundMethodVersion;

    const { data: nextDraft, error: draftErr } = await context.supabase
      .from("compound_method_versions")
      .insert({
        compound_id: c.compound_id,
        created_by: context.userId,
        created_by_name: data.analyst_name,
        acquisition_method: c.acquisition_method,
        processing_method: c.processing_method,
        gradient: c.gradient,
        column_temperature_c: c.column_temperature_c,
        injection_volume_ul: c.injection_volume_ul,
        special_handling: c.special_handling,
        notes: c.notes,
      })
      .select(COLUMNS)
      .single();
    if (draftErr) throw draftErr;

    return { confirmed: c, draft: nextDraft as unknown as CompoundMethodVersion };
  });

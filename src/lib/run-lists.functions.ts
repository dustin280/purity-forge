import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { releaseSampleFromInstrument } from "@/lib/run-lists/vial-release.functions";

/**
 * Deleting a run list cascades run_list_items away, but sample_locations /
 * tray_positions aren't FK'd to run_lists at all -- a raw delete left
 * occupied vial positions permanently "reserved" with nothing pointing at
 * them, silently blocking every future generation from offering those
 * samples again. Release every sample on the list from its instrument
 * position first so a delete is actually safe to regenerate after.
 */
async function releaseRunListVials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  runListIds: string[],
): Promise<void> {
  const { data: items, error } = await supabase
    .from("run_list_items")
    .select("sample_id")
    .in("run_list_id", runListIds)
    .not("sample_id", "is", null);
  if (error) throw error;
  const sampleIds = [...new Set((items ?? []).map((r: { sample_id: string }) => r.sample_id))] as string[];
  await Promise.all(sampleIds.map((id) => releaseSampleFromInstrument(supabase, id)));
}

const WHITELIST_SAMPLE_FIELDS = new Set([
  "batch_id","client","project","compound","lot","catalog","concentration",
  "container_size","physical_description","notes","status",
]);

/**
 * The internal QC row-type codes (optimizer.ts's SequenceRowType) aren't
 * valid OpenLab "Sample Type" values -- OpenLab only accepts Sample /
 * Blank / Double blank / Cal. Std. / QC check / Spike / Sys. Suit.
 * Confirmed with Dustin (2026-08-25): NIB/ICB/CCB are blanks; LCS (which
 * replaced the once-per-sequence ICV row) verifies method accuracy, not a
 * calibration curve, so it's "QC check" rather than "Cal. Std.". ICV/CCV
 * are kept mapped for historical run lists generated before that change.
 * Surrogate will also map to "QC check" once it's generated.
 */
const OPENLAB_SAMPLE_TYPE_FOR_QC_CODE: Record<string, string> = {
  NIB: "Blank", ICB: "Blank", CCB: "Blank",
  LCS: "QC check", ICV: "QC check", CCV: "QC check",
  CalStd: "Cal. Std.",
};

/** NIB = "No Injection/Instrument Blank" -- the Injection Source column calls that out explicitly; every other row leaves it blank. */
const NIB_INJECTION_SOURCE = "No Injection/Instrument Blank";

/** Fallback Method when a run list has none selected -- Dustin's real default acquisition method (2026-08-25), not a placeholder. */
export const DEFAULT_METHOD_NAME = "1 - New gradient with SbAq-trim.amx";

export interface RunListSummary {
  id: string;
  document_number: string;
  name: string;
  status: "draft" | "exported";
  instrument_id: string | null;
  method_name: string | null;
  starting_vial: number;
  inj_per_vial: number;
  data_file_pattern: string;
  notes: string | null;
  exported_at: string | null;
  csv_storage_path: string | null;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

export interface RunListItem {
  id: string;
  run_list_id: string;
  sample_id: string | null;
  row_no: number;
  sample_type: string;
  method_override: string | null;
  vial: number | null;
  data_file: string | null;
  comment: string | null;
  extras: Record<string, string | number | boolean | null>;
}

export interface PrepFlaggedSample {
  id: string;
  batch_id: string;
  client: string;
  project: string | null;
  compound: string | null;
  lot: string | null;
  prep_flagged_at: string | null;
  receipt_date: string;
}

/* ------------------ Prep flag ------------------ */

export const setSamplePrepFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sample_id: z.string().uuid(), flag: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("samples").update({
      prep_flag: data.flag,
      prep_flagged_at: data.flag ? new Date().toISOString() : null,
      prep_flagged_by: data.flag ? context.userId : null,
    }).eq("id", data.sample_id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkSetSamplePrepFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sample_ids: z.array(z.string().uuid()).min(1), flag: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("samples").update({
      prep_flag: data.flag,
      prep_flagged_at: data.flag ? new Date().toISOString() : null,
      prep_flagged_by: data.flag ? context.userId : null,
    }).in("id", data.sample_ids);
    if (error) throw error;
    return { ok: true, count: data.sample_ids.length };
  });

export const listPrepFlaggedSamples = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // A sample that has finished analysis is not outstanding prep work, even
    // if its flag was never cleared. Two approved samples had been sitting in
    // the Prep Queue since August -- one of them showing as "needs input" --
    // which makes a queue of finished work look like a queue of problems.
    const { data, error } = await context.supabase
      .from("samples")
      .select("id,batch_id,client,project,compound,lot,prep_flagged_at,receipt_date")
      .eq("prep_flag", true)
      .not("status", "in", "(approved,complete,cancelled)")
      .order("prep_flagged_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as PrepFlaggedSample[];
  });

/* ------------------ Run lists ------------------ */

const runListInput = z.object({
  name: z.string().min(1).max(200),
  instrument_id: z.string().uuid().nullable().optional(),
  method_name: z.string().max(255).nullable().optional(),
  starting_vial: z.number().int().min(1).max(9999).default(1),
  inj_per_vial: z.number().int().min(1).max(99).default(1),
  data_file_pattern: z.string().min(1).max(255).default("{sample}_{yyyyMMdd}_{seq}"),
  notes: z.string().max(2000).nullable().optional(),
});

export const listRunLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("run_lists").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as RunListSummary[];
  });

export const createRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runListInput.parse(d))
  .handler(async ({ context, data }) => {
    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "RUNL", p_source_table: "run_lists", p_source_id: rowId, p_created_by: context.userId });
    if (docErr) throw docErr;

    const { data: row, error } = await context.supabase.from("run_lists").insert({
      ...data, id: rowId, document_number: docNumber, created_by: context.userId,
    }).select("id").single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const updateRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runListInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("run_lists").update(rest).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await releaseRunListVials(context.supabase, [data.id]);
    const { error } = await context.supabase.from("run_lists").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteRunLists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await releaseRunListVials(context.supabase, data.ids);
    const { error } = await context.supabase.from("run_lists").delete().in("id", data.ids);
    if (error) throw error;
    return { ok: true, deleted: data.ids.length };
  });

export const getRunList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: list, error } = await context.supabase
      .from("run_lists").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!list) throw new Error("Run list not found");
    const { data: items, error: e2 } = await context.supabase
      .from("run_list_items").select("*").eq("run_list_id", data.id).order("row_no", { ascending: true });
    if (e2) throw e2;
    const sampleIds = (items ?? []).map(i => (i as { sample_id: string | null }).sample_id).filter(Boolean) as string[];
    let samples: Array<{ id: string; batch_id: string; client: string; project: string | null; compound: string | null; lot: string | null; label_content_value: number | null; label_content_unit: string | null }> = [];
    if (sampleIds.length) {
      const { data: s } = await context.supabase
        .from("samples").select("id,batch_id,client,project,compound,lot,label_content_value,label_content_unit").in("id", sampleIds);
      samples = (s ?? []) as typeof samples;
    }
    return {
      list: list as unknown as RunListSummary,
      items: (items ?? []) as unknown as RunListItem[],
      samples,
    };
  });

/* ------------------ Items ------------------ */

export const addSamplesToRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      run_list_id: z.string().uuid(),
      sample_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: list } = await context.supabase
      .from("run_lists").select("starting_vial").eq("id", data.run_list_id).maybeSingle();
    const startingVial = (list as { starting_vial?: number } | null)?.starting_vial ?? 1;
    const { data: existing } = await context.supabase
      .from("run_list_items").select("row_no").eq("run_list_id", data.run_list_id)
      .order("row_no", { ascending: false }).limit(1);
    const nextRow = ((existing as Array<{ row_no: number }> | null)?.[0]?.row_no ?? 0) + 1;
    const rows = data.sample_ids.map((sid, i) => ({
      run_list_id: data.run_list_id,
      sample_id: sid,
      row_no: nextRow + i,
      sample_type: "Sample",
      vial: startingVial + (nextRow - 1) + i,
    }));
    const { error } = await context.supabase.from("run_list_items").insert(rows);
    if (error) throw error;
    return { added: rows.length };
  });

export const updateRunListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    sample_type: z.string().max(40).optional(),
    method_override: z.string().max(255).nullable().optional(),
    vial: z.number().int().min(0).max(9999).nullable().optional(),
    comment: z.string().max(500).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("run_list_items").update(rest).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const removeRunListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("run_list_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const reorderRunListItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    run_list_id: z.string().uuid(),
    ordered_ids: z.array(z.string().uuid()).max(500),
  }).parse(d))
  .handler(async ({ context, data }) => {
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await context.supabase.from("run_list_items")
        .update({ row_no: i + 1 }).eq("id", data.ordered_ids[i]);
      if (error) throw error;
    }
    return { ok: true };
  });

/* ------------------ CSV export ------------------ */

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderPattern(pattern: string, ctx: { sample: string; seq: number; vial: number | string | null; date: Date }): string {
  const yyyy = ctx.date.getUTCFullYear().toString();
  const MM = String(ctx.date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ctx.date.getUTCDate()).padStart(2, "0");
  return pattern
    .replace(/\{sample\}/g, ctx.sample)
    .replace(/\{seq\}/g, String(ctx.seq).padStart(3, "0"))
    .replace(/\{vial\}/g, ctx.vial != null ? String(ctx.vial) : "")
    .replace(/\{yyyyMMdd\}/g, `${yyyy}${MM}${dd}`)
    .replace(/\{yyyy\}/g, yyyy)
    .replace(/\{MM\}/g, MM)
    .replace(/\{dd\}/g, dd);
}

export const generateRunListCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    run_list_id: z.string().uuid(),
    persist: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ context, data }) => {
    return await buildRunListCsv(context.supabase, context.userId, data.run_list_id, data.persist);
  });

/**
 * Core CSV builder. Exported so other server functions (e.g. Drive push)
 * can produce the same CSV without round-tripping through RPC.
 */
export async function buildRunListCsv(
  supabase: any,
  userId: string,
  runListId: string,
  persist: boolean,
): Promise<{ filename: string; csv: string; storage_path: string | null }> {
  const [{ data: list }, { data: items }, { data: cols }] = await Promise.all([
      supabase.from("run_lists").select("*").eq("id", runListId).maybeSingle(),
      supabase.from("run_list_items").select("*").eq("run_list_id", runListId).order("row_no", { ascending: true }),
      supabase.from("run_list_columns").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    ]);
    if (!list) throw new Error("Run list not found");
    const sampleIds = (items ?? []).map((i: { sample_id: string | null }) => i.sample_id).filter(Boolean) as string[];
    const sampleMap = new Map<string, Record<string, unknown>>();
    if (sampleIds.length) {
      const { data: s } = await supabase.from("samples").select("*").in("id", sampleIds);
      (s ?? []).forEach((row: Record<string, unknown>) => sampleMap.set(row.id as string, row));
    }
    const prepIds = (items ?? []).map((i: { sp_preparation_record_id: string | null }) => i.sp_preparation_record_id).filter(Boolean) as string[];
    const prepNumberById = new Map<string, string>();
    if (prepIds.length) {
      const { data: preps } = await supabase.from("sp_preparation_records").select("id, prep_number").in("id", prepIds);
      (preps ?? []).forEach((row: { id: string; prep_number: string }) => prepNumberById.set(row.id, row.prep_number));
    }
    const columns = (cols ?? []) as Array<{ key: string; source: string; default_value: string | null; sample_field: string | null }>;
    const headers = columns.map(c => csvEscape(c.key));
    const date = new Date();
    const lines: string[] = [headers.join(",")];
    const listRow = list as { method_name: string | null; data_file_pattern: string; starting_vial: number };
    (items ?? []).forEach((it: Record<string, unknown>, idx: number) => {
      const sample = it.sample_id ? sampleMap.get(it.sample_id as string) : undefined;
      const sampleName = (sample?.batch_id as string) ?? `Row${idx + 1}`;
      // Instrument-facing sample name: Syx ID-Lot-Compound-Amount, tagged
      // with the literal <D> marker OpenLab uses to append a result
      // timestamp. QC rows (no linked sample) keep their row type instead.
      const composedSampleName = sample
        ? [
            sample.batch_id as string,
            sample.lot as string | null,
            sample.compound as string | null,
            sample.label_content_value != null
              ? `${sample.label_content_value}${(sample.label_content_unit as string | null) ?? ""}`
              : null,
          ].filter(Boolean).join("-") + " <D>"
        : ((it.sample_type as string | null) ?? "");
      // Tray-style position codes (e.g. "A1") don't fit the legacy integer
      // `vial` column, so the generator stores them in extras.position_code
      // instead — fall back to that so the CSV's Vial column still populates.
      const extras = (it.extras ?? null) as { position_code?: string | null } | null;
      const vial = (it.vial as number | null) ?? extras?.position_code ?? null;
      const dataFile = (it.data_file as string | null) ?? renderPattern(listRow.data_file_pattern, {
        sample: sampleName, seq: idx + 1, vial, date,
      });
      const row = columns.map(c => {
        switch (c.source) {
          case "literal": return csvEscape(c.default_value ?? "");
          case "sample_field": {
            const f = c.sample_field ?? "";
            if (!WHITELIST_SAMPLE_FIELDS.has(f)) return csvEscape("");
            return csvEscape(sample?.[f] ?? "");
          }
          case "method": return csvEscape((it.method_override as string | null) ?? listRow.method_name ?? DEFAULT_METHOD_NAME);
          case "vial": return csvEscape(vial ?? "");
          case "data_file_pattern": return csvEscape(dataFile);
          default: return csvEscape("");
        }
      });
      const rawSampleType = it.sample_type as string | null;
      const prepNumber = it.sp_preparation_record_id ? prepNumberById.get(it.sp_preparation_record_id as string) : undefined;
      // Per-row override for Sample Name, Sample Type, Sample Info,
      // Injection Source, and Comment columns when keys match
      columns.forEach((c, ci) => {
        if (c.key === "Sample Name") row[ci] = csvEscape(composedSampleName);
        if (c.key === "Sample Type" && rawSampleType) row[ci] = csvEscape(OPENLAB_SAMPLE_TYPE_FOR_QC_CODE[rawSampleType] ?? rawSampleType);
        if (c.key === "Sample Info" && prepNumber) row[ci] = csvEscape(prepNumber);
        if (c.key === "Injection Source" && rawSampleType === "NIB") row[ci] = csvEscape(NIB_INJECTION_SOURCE);
        if (c.key === "Comment" && it.comment) row[ci] = csvEscape(it.comment);
      });
      lines.push(row.join(","));
    });
    const csv = lines.join("\r\n") + "\r\n";
    // The Name field already carries the analyst's own date/run convention
    // (e.g. "2026-08-21_Bobbie_Run01") and sometimes an accidental trailing
    // ".csv" — strip that before sanitizing so the exported/pushed filename
    // actually matches what's shown on screen, instead of a mangled name
    // plus a second, today's-date suffix nobody would recognize.
    const rawName = ((list as { name: string }).name || "run-list").replace(/\.csv$/i, "");
    const safeName = rawName.replace(/[^a-z0-9_\-]+/gi, "_") || "run-list";
    const filename = `${safeName}.csv`;

    let storagePath: string | null = null;
    if (persist) {
      storagePath = `exports/${runListId}.csv`;
      const { error: upErr } = await supabase.storage
        .from("openlab-cds")
        .upload(storagePath, new Blob([csv], { type: "text/csv" }), { upsert: true, contentType: "text/csv" });
      if (upErr) throw upErr;
      await supabase.from("run_lists").update({
        status: "exported",
        exported_at: new Date().toISOString(),
        exported_by: userId,
        csv_storage_path: storagePath,
      }).eq("id", runListId);
    }

    return { filename, csv, storage_path: storagePath };
}

export const markRunListSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("run_lists").update({
      status: "exported",
      exported_at: new Date().toISOString(),
      exported_by: context.userId,
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// TODO: future on-prem agent delivery — POST CSV to /api/public/run-list-agent
// (HMAC-signed) so a lab-LAN agent can drop it on the OpenLab share.
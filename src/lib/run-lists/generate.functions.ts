/**
 * Run List Generator: preview + persist optimized sequences and export
 * an OpenLab CDS-friendly CSV.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTIVE_SAMPLE_STATUSES } from "@/lib/lims-utils";
import { optimize, type OptimizedSequence, type OptimizerSample } from "./optimizer";
import { releaseSampleFromInstrument } from "./vial-release.functions";

const previewInput = z.object({ instrument_id: z.string().uuid() });

async function loadContext(supabase: any, instrumentId: string) {
  // Samples already actively occupying an instrument position shouldn't be
  // offered a second vial by a future "Analyze & propose" -- they're
  // already on the instrument until completed or manually released.
  const { data: occupiedRows } = await supabase
    .from("sample_locations")
    .select("sample_id")
    .eq("location_type", "instrument")
    .eq("status", "active");
  const occupiedSampleIds = [...new Set((occupiedRows ?? []).map((r: { sample_id: string }) => r.sample_id))];

  // Samples flagged for a non-chromatographic test (dedicated vials pulled
  // aside for manual/outsourced testing — see test-provisioning.ts) never
  // run on this instrument, even though intake also gives every sample a
  // baseline "purity" test row. Exclude them from the HPLC candidate pool.
  const NON_CHROM_TEST_TYPES = ["sterility", "endotoxin", "heavy_metals"];
  const { data: nonChromRows } = await supabase
    .from("tests")
    .select("sample_id")
    .in("test_type", NON_CHROM_TEST_TYPES);
  const nonChromSampleIds = [...new Set((nonChromRows ?? []).map((r: { sample_id: string }) => r.sample_id))];
  const excludedSampleIds = [...new Set([...occupiedSampleIds, ...nonChromSampleIds])];

  const [{ data: instrument }, { data: methodGroups }, { data: samples }] = await Promise.all([
    supabase.from("inventory_items")
      .select("id,instrument_name,make,model,default_method_folder,tray_config_id,instrument_status,drive_sequences_folder_id")
      .eq("id", instrumentId).maybeSingle(),
    supabase.from("method_groups").select("*").eq("is_active", true).order("priority"),
    (() => {
      let q = supabase.from("samples")
        .select("id,batch_id,compound,method_group_id,status,lot,concentration")
        .in("status", ACTIVE_SAMPLE_STATUSES as unknown as string[]);
      if (excludedSampleIds.length) q = q.not("id", "in", `(${excludedSampleIds.join(",")})`);
      return q;
    })(),
  ]);
  if (!instrument) throw new Error("Instrument not found");
  // Ordering doesn't matter here — optimize() sorts parseable vial
  // locations into canonical row-major order itself (see optimizer.ts).
  const trayId = (instrument as { tray_config_id: string | null }).tray_config_id;
  const trayRes = trayId
    ? await supabase.from("tray_positions")
        .select("position_code,status")
        .eq("tray_config_id", trayId).eq("status", "available")
    : { data: [] as Array<{ position_code: string }> };
  return {
    instrument: instrument as {
      id: string; instrument_name: string | null; make: string | null; model: string | null;
      default_method_folder: string | null; tray_config_id: string | null;
      drive_sequences_folder_id: string | null;
    },
    methodGroups: (methodGroups ?? []) as Array<{
      id: string; name: string; temperature_c: number; priority: number;
      default_acquisition_method: string | null; default_processing_method: string | null;
    }>,
    samples: (samples ?? []) as OptimizerSample[],
    trayPositions: (trayRes.data ?? []) as Array<{ position_code: string }>,
  };
}

export const previewGeneratedSequences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewInput.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await loadContext(context.supabase, data.instrument_id);
    const sequences = optimize({
      samples: ctx.samples,
      methodGroups: ctx.methodGroups,
      trayPositions: ctx.trayPositions,
    });
    // C6: surface prep coverage at preview time (non-blocking — see the
    // older run-list detail page's "export allowed" precedent) so an
    // analyst sees it before generating, not only after.
    const sampleIds = [...new Set(
      sequences.flatMap((s) => s.rows.map((r) => r.sample_id)).filter((id): id is string => !!id),
    )];
    const { warnings } = await resolvePrepsAndCoverage(context.supabase, sampleIds);
    const sequencesWithWarnings = sequences.map((seq) => ({
      ...seq,
      rows: seq.rows.map((r) => ({
        ...r,
        prep_warning: r.sample_id ? warnings.get(r.sample_id) ?? null : null,
      })),
    }));
    return {
      instrument: ctx.instrument, sequences: sequencesWithWarnings, sample_count: ctx.samples.length,
      tray_configured: !!ctx.instrument.tray_config_id,
    };
  });

/**
 * Samples currently occupying an instrument vial position, oldest first —
 * feeds the "no positions left" warning dialog so an analyst can free up
 * space (e.g. a run that's physically finished but hasn't been reviewed
 * yet) instead of generation silently producing null vials.
 */
export const listInstrumentOccupants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: locs, error } = await context.supabase
      .from("sample_locations")
      .select("id, sample_id, location, assigned_at, sample:samples(id, batch_id, client, compound, status)")
      .eq("location_type", "instrument")
      .eq("status", "active")
      .order("assigned_at", { ascending: true });
    if (error) throw error;
    return (locs ?? []) as Array<{
      id: string; sample_id: string; location: string; assigned_at: string;
      sample: { id: string; batch_id: string; client: string; compound: string | null; status: string } | null;
    }>;
  });

/** Bulk "remove from instrument" for the warning dialog's checked samples. */
export const releaseInstrumentPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sample_ids: z.array(z.string().uuid()).min(1).max(500),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await Promise.all(data.sample_ids.map((id) => releaseSampleFromInstrument(context.supabase, id)));
    return { ok: true, released: data.sample_ids.length };
  });

/**
 * "SYX6_1-12_8-22-26": leading zeros stripped from both the SYX prefix
 * number and the sample suffix numbers, suffixes collapsed to a min-max
 * range (gaps from excluded rows aren't enumerated), one SYXn_range
 * segment per distinct SYX prefix present, then the generation date
 * (M-D-YY, no leading zeros). Nobody reads the instrument name or a
 * sequence counter off the run list name -- the samples on it are what
 * matters. Falls back to a date-only name if nothing parses as a Syx ID
 * (e.g. all QC rows, or a non-standard batch_id format).
 */
function buildRunListName(batchIds: string[], date: Date): string {
  const groups = new Map<number, number[]>();
  for (const batchId of batchIds) {
    const m = batchId.match(/^SYX-(\d+)-(\d+)/i);
    if (!m) continue;
    const prefix = parseInt(m[1], 10);
    const suffix = parseInt(m[2], 10);
    const arr = groups.get(prefix) ?? [];
    arr.push(suffix);
    groups.set(prefix, arr);
  }
  const dateStr = `${date.getUTCMonth() + 1}-${date.getUTCDate()}-${String(date.getUTCFullYear()).slice(-2)}`;
  if (!groups.size) return `RunList_${dateStr}`;
  const parts = Array.from(groups.keys()).sort((a, b) => a - b).map(prefix => {
    const suffixes = groups.get(prefix) as number[];
    const min = Math.min(...suffixes);
    const max = Math.max(...suffixes);
    return `SYX${prefix}_${min === max ? String(min) : `${min}-${max}`}`;
  });
  return `${parts.join("_")}_${dateStr}`;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mapSampleType(t: string): string {
  switch (t) {
    case "NIB": case "ICB": case "CCB": return "Blank";
    case "ICV": case "CCV": return "Cal. Std.";
    default: return "Sample";
  }
}

function looksLikePath(v: string | null): boolean {
  return !!v && (/[\\/]/.test(v) || /\.(amx|pmx|m|M|pm)$/i.test(v));
}

function joinWinPath(folder: string, name: string, ext: string): string {
  const base = folder.replace(/[\\/]+$/, "");
  const filename = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.${ext}`;
  return `${base}\\${filename}`;
}

function fullMethodPath(v: string | null, folder: string | null, ext: "amx" | "pmx"): string {
  if (!v) return "";
  if (looksLikePath(v)) return v;
  if (!folder) return v;
  return joinWinPath(folder, v, ext);
}

/**
 * Approved (non-expired) prep record for a sample, resolved for the C-track
 * dilution tie-in. Dilutor1 is a multiplier in OpenLab — confirmed 2026-08-20
 * by injecting a known standard with Dilutor1=2 and observing the reported
 * amount double, not halve.
 */
interface ResolvedPrep {
  id: string;
  total_dilution_factor: number | null;
}

export type PrepWarning = "no_prep" | "not_approved" | "expired";

/**
 * One query, two derived views, kept together so they can't drift apart:
 * `preps` (the approved, non-expired record actually used for Dil. Factor 1 /
 * LimsId1 / sp_preparation_record_id) and `warnings` (why a sample *isn't* in
 * that map, for the C6 coverage banner — the newest record's status/expiry
 * per sample, or "no_prep" if it has none at all).
 */
async function resolvePrepsAndCoverage(
  supabase: any,
  sampleIds: string[],
): Promise<{ preps: Map<string, ResolvedPrep>; warnings: Map<string, PrepWarning | null> }> {
  const preps = new Map<string, ResolvedPrep>();
  const warnings = new Map<string, PrepWarning | null>();
  if (!sampleIds.length) return { preps, warnings };
  const wanted = new Set(sampleIds);
  // Filtered in application code rather than via a `sample_context->>sample_id`
  // PostgREST filter: the real sample UUID only lives inside that jsonb blob
  // (see D2), and no other query in this codebase filters on a JSON path, so
  // there's no precedent here to trust it round-trips through the client.
  const { data, error } = await supabase
    .from("sp_preparation_records")
    .select("id, status, total_dilution_factor, sample_context, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const now = Date.now();
  const rows = (data ?? []) as Array<{
    id: string; status: string; total_dilution_factor: number | null;
    sample_context: { sample_id?: string } | null; expires_at: string | null; created_at: string;
  }>;
  // Pass 1: the newest APPROVED, non-expired record per sample — this is
  // what generation actually uses. A newer draft/rejected record must not
  // hide an older-but-still-good approved one.
  for (const row of rows) {
    const sid = row.sample_context?.sample_id;
    if (!sid || !wanted.has(sid) || preps.has(sid)) continue;
    const expired = !!row.expires_at && new Date(row.expires_at).getTime() < now;
    if (row.status === "approved" && !expired) {
      preps.set(sid, { id: row.id, total_dilution_factor: row.total_dilution_factor });
    }
  }
  // Pass 2: for samples with no usable prep, explain why using their single
  // newest record overall (rows are already sorted newest-first).
  for (const row of rows) {
    const sid = row.sample_context?.sample_id;
    if (!sid || !wanted.has(sid) || preps.has(sid) || warnings.has(sid)) continue;
    const expired = !!row.expires_at && new Date(row.expires_at).getTime() < now;
    warnings.set(sid, expired ? "expired" : "not_approved");
  }
  for (const sid of sampleIds) if (!preps.has(sid) && !warnings.has(sid)) warnings.set(sid, "no_prep");
  return { preps, warnings };
}

interface ResolvedStandard {
  syn_id: string | null;
  standard_name: string;
}

/**
 * A5: resolve the SYX ID / name for whichever standard_preparation_logs rows
 * the analyst picked to back QC rows on the review screen — used to append
 * the standard's identity onto the CSV Sample name.
 */
async function resolveStandardPreps(
  supabase: any,
  standardPrepIds: string[],
): Promise<Map<string, ResolvedStandard>> {
  const result = new Map<string, ResolvedStandard>();
  if (!standardPrepIds.length) return result;
  const { data, error } = await supabase
    .from("standard_preparation_logs")
    .select("id, syn_id, standard_name")
    .in("id", standardPrepIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string; syn_id: string | null; standard_name: string }>) {
    result.set(row.id, { syn_id: row.syn_id, standard_name: row.standard_name });
  }
  return result;
}

interface SampleFields {
  received_quantity: number | null;
  batch_id: string;
  lot: string | null;
  compound: string | null;
  client: string | null;
  physical_description: string | null;
  label_content_value: number | null;
  label_content_unit: string | null;
}

/**
 * "Sample Amt" in the analyst's sequence table is the as-received quantity
 * on the vial (samples.received_quantity) — not anything prep-derived.
 * Confirmed 2026-08-20. batch_id feeds LimsId1 (D3/C4): a dedicated field
 * instead of re-parsing it back out of the composed sample name. client,
 * physical_description, and label_content_* feed the C5 Sample Custom
 * Parameters (Client, Appearance, NetFContent — confirmed 2026-08-20).
 */
async function resolveSampleFields(
  supabase: any,
  sampleIds: string[],
): Promise<Map<string, SampleFields>> {
  const result = new Map<string, SampleFields>();
  if (!sampleIds.length) return result;
  const { data, error } = await supabase
    .from("samples")
    .select("id, received_quantity, batch_id, lot, compound, client, physical_description, label_content_value, label_content_unit")
    .in("id", sampleIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<SampleFields & { id: string }>) {
    result.set(row.id, {
      received_quantity: row.received_quantity, batch_id: row.batch_id, lot: row.lot, compound: row.compound,
      client: row.client,
      physical_description: row.physical_description,
      label_content_value: row.label_content_value, label_content_unit: row.label_content_unit,
    });
  }
  return result;
}

function sequenceToCsv(
  seq: OptimizedSequence,
  injectionVolumeUL: number | "method",
  methodFolder: string | null,
  dilutionBySampleId: Map<string, ResolvedPrep>,
  sampleFieldsBySampleId: Map<string, SampleFields>,
  accessionNumberByRowIndex: Map<number, number>,
  standardsById: Map<string, ResolvedStandard>,
): string {
  const headers = [
    "Sample name", "Sample type", "Vial", "Volume",
    "Acq Method", "Proc Method", "Data file", "Description", "Level",
    "Sample Amt", "Dil. Factor 1", "LimsId1",
    "Client", "Appearance", "NetFContent", "Accession Number",
  ];
  const volumeCell = injectionVolumeUL === "method" ? "" : String(injectionVolumeUL);
  const rows = seq.rows.map((r, i) => {
    const desc = r.method_group_name ?? "";
    const fields = r.sample_id ? sampleFieldsBySampleId.get(r.sample_id) : undefined;
    // Instrument-facing sample name: Syx ID-Lot-Compound-Amount. QC rows
    // keep their label as-is. LimsId1 (D3/C4) carries the real batch_id as
    // its own dedicated field, so nothing downstream needs to re-parse this
    // string for identity — it's purely for the analyst reading the sequence.
    const isSample = r.type === "Sample";
    const batchIdForName = fields?.batch_id ?? r.label.split(" — ")[0].split(" (Lot")[0];
    const linkedStandard = r.standard_prep_id ? standardsById.get(r.standard_prep_id) : undefined;
    const amt = fields?.label_content_value != null
      ? `${fields.label_content_value}${fields.label_content_unit ?? ""}`
      : null;
    const baseName = isSample
      ? [batchIdForName, r.lot, fields?.compound, amt].filter(Boolean).join("-")
      : (linkedStandard ? `${r.label}_${linkedStandard.syn_id ?? linkedStandard.standard_name}` : r.label);
    // OpenLab appends a result timestamp when the sample name carries this
    // literal marker — required by the analyst's instrument workflow.
    const sampleName = `${baseName} <D>`;
    const prep = r.sample_id ? dilutionBySampleId.get(r.sample_id) : undefined;
    const dilFactor = prep?.total_dilution_factor ?? 1;
    const sampleAmt = fields?.received_quantity ?? "";
    const limsId1 = isSample ? (fields?.batch_id ?? "") : "";
    // NetFContent: label_content_value is captured in mg or µg at intake
    // (see components/label_content_* on samples) — normalize to mg since
    // that's what NetFContent represents. Standard Purity (%) deliberately
    // left blank on Sample rows per Dustin, 2026-08-20.
    const netFContent = fields?.label_content_value == null ? "" :
      fields.label_content_unit === "ug" ? fields.label_content_value / 1000 : fields.label_content_value;
    const accessionNumber = accessionNumberByRowIndex.get(i) ?? "";
    return [
      sampleName,
      mapSampleType(r.type),
      r.vial ?? "",
      volumeCell,
      fullMethodPath(r.acquisition_method, methodFolder, "amx"),
      fullMethodPath(r.processing_method, methodFolder, "pmx"),
      "", // Data file — let OpenLab auto-generate
      desc,
      r.level ?? "",
      sampleAmt,
      dilFactor,
      limsId1,
      fields?.client ?? "",
      fields?.physical_description ?? "",
      netFContent,
      accessionNumber,
    ].map(csvEscape).join(",");
  });
  return [headers.join(","), ...rows].join("\r\n");
}

export const generateAndSaveRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    instrument_id: z.string().uuid(),
    sequence_index: z.number().int().min(1),
    injection_volume_ul: z.union([z.literal("method"), z.number().min(0.1).max(1000)]).default("method"),
    // optional overrides posted from the review screen
    rows: z.array(z.object({
      type: z.enum(["NIB", "ICB", "ICV", "CCB", "CCV", "Sample"]),
      label: z.string(),
      sample_id: z.string().uuid().nullable(),
      lot: z.string().nullable().optional(),
      vial: z.string().nullable(),
      acquisition_method: z.string().nullable(),
      processing_method: z.string().nullable(),
      level: z.string().nullable().optional(),
      standard_prep_id: z.string().uuid().nullable().optional(),
    })).min(1),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: inst } = await context.supabase
      .from("inventory_items")
      .select("id,instrument_name,make,model,default_method_folder,drive_sequences_folder_id,tray_config_id")
      .eq("id", data.instrument_id).maybeSingle();
    if (!inst) throw new Error("Instrument not found");
    const instRow = inst as {
      instrument_name: string | null; make: string | null; model: string | null;
      default_method_folder: string | null; drive_sequences_folder_id: string | null;
      tray_config_id: string | null;
    };
    const instName = instRow.instrument_name
      ?? [instRow.make, instRow.model].filter(Boolean).join(" ")
      ?? "Instrument";
    const today = new Date();

    const seq: OptimizedSequence = {
      index: data.sequence_index,
      name: "",
      primary_group_id: null,
      temperature_c: null,
      rows: data.rows.map((r) => ({
        type: r.type, label: r.label, sample_id: r.sample_id, lot: r.lot ?? null,
        method_group_id: null, method_group_name: null,
        acquisition_method: r.acquisition_method, processing_method: r.processing_method,
        vial: r.vial, level: r.level ?? null, why: "",
        standard_prep_id: r.standard_prep_id ?? null,
      })),
    };
    const sampleIds = [...new Set(seq.rows.map((r) => r.sample_id).filter((id): id is string => !!id))];
    const standardPrepIds = [...new Set(seq.rows.map((r) => r.standard_prep_id).filter((id): id is string => !!id))];
    const sampleRowIndices = seq.rows.map((r, i) => (r.type === "Sample" ? i : null)).filter((i): i is number => i !== null);
    const [{ preps }, sampleFields, accessionNumbers, standardsById] = await Promise.all([
      resolvePrepsAndCoverage(context.supabase, sampleIds),
      resolveSampleFields(context.supabase, sampleIds),
      sampleRowIndices.length
        ? context.supabase.rpc("next_accession_numbers", { p_count: sampleRowIndices.length })
          .then(({ data, error }: { data: number[] | null; error: Error | null }) => {
            if (error) throw error;
            return data ?? [];
          })
        : Promise.resolve([] as number[]),
      resolveStandardPreps(context.supabase, standardPrepIds),
    ]);
    const accessionNumberByRowIndex = new Map(sampleRowIndices.map((rowIdx, n) => [rowIdx, accessionNumbers[n]]));
    const batchIds = sampleRowIndices.map(i => seq.rows[i].sample_id).filter((id): id is string => !!id)
      .map(sid => sampleFields.get(sid)?.batch_id).filter((b): b is string => !!b);
    const runListName = buildRunListName(batchIds, today);
    seq.name = runListName;
    const filename = `${runListName}.csv`;
    const csv = sequenceToCsv(seq, data.injection_volume_ul, instRow.default_method_folder, preps, sampleFields, accessionNumberByRowIndex, standardsById);
    const csvWithBom = "\uFEFF" + csv;

    // Persist as a run_lists + run_list_items record for history/audit
    const { data: rl, error: rlErr } = await context.supabase.from("run_lists").insert({
      name: runListName,
      status: "exported",
      instrument_id: null,       // legacy scheduler-instrument fk; not used here
      method_name: null,
      starting_vial: 1,
      inj_per_vial: 1,
      data_file_pattern: "{sample}_{seq}",
      notes: `Auto-generated for ${instName}`,
      exported_at: new Date().toISOString(),
      created_by: context.userId,
    }).select("id").single();
    if (rlErr) throw rlErr;

    const items = seq.rows.map((r, i) => ({
      run_list_id: rl.id,
      sample_id: r.sample_id,
      row_no: i + 1,
      sample_type: r.type,
      method_override: r.acquisition_method,
      vial: null,                 // tray-style codes don't fit the legacy int column —
      data_file: null,            // the real code lives in extras.position_code instead,
      comment: null,              // which the CSV builder reads (see buildRunListCsv).
      extras: { position_code: r.vial, processing_method: r.processing_method },
      sp_preparation_record_id: (r.sample_id && preps.get(r.sample_id)?.id) || null,
      accession_number: accessionNumberByRowIndex.get(i) ?? null,
      standard_prep_id: r.standard_prep_id ?? null,
    }));
    await context.supabase.from("run_list_items").insert(items);

    // Persist the vial assignment: tag each occupied position 'reserved'
    // so regenerating won't offer it again, and log an active instrument
    // location per sample so completion (releaseSampleFromInstrument) and
    // the Sample Disposal Log both have something to act on.
    const occupied = seq.rows.filter((r) => r.sample_id && r.vial);
    if (occupied.length && instRow.tray_config_id) {
      const codes = [...new Set(occupied.map((r) => r.vial as string))];
      const { data: positions } = await context.supabase
        .from("tray_positions")
        .select("id, position_code")
        .eq("tray_config_id", instRow.tray_config_id)
        .in("position_code", codes);
      const posIdByCode = new Map((positions ?? []).map((p: { id: string; position_code: string }) => [p.position_code, p.id]));

      const locationRows = occupied
        .map((r) => ({
          sample_id: r.sample_id as string,
          location_type: "instrument",
          location: r.vial as string,
          tray_position_id: posIdByCode.get(r.vial as string) ?? null,
          status: "active",
        }))
        .filter((r): r is typeof r & { tray_position_id: string } => r.tray_position_id !== null);
      if (locationRows.length) {
        await context.supabase.from("sample_locations").insert(locationRows);
        const usedPositionIds = locationRows.map((r) => r.tray_position_id);
        await context.supabase.from("tray_positions").update({ status: "reserved" }).in("id", usedPositionIds);
      }
    }

    return {
      run_list_id: rl.id as string,
      filename,
      csv: csvWithBom,
      drive_sequences_folder_id: instRow.drive_sequences_folder_id,
    };
  });

/* ---------------- Push to Drive ---------------- */

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function driveHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error("Google Drive is not connected. Link the Google Drive connector in Project Settings.");
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

async function driveFindByName(folderId: string, name: string): Promise<string | null> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
  );
  const r = await fetch(
    `${DRIVE_GATEWAY}/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`,
    { headers: driveHeaders() },
  );
  if (!r.ok) throw new Error(`Drive find failed (${r.status}): ${await r.text()}`);
  const j = (await r.json()) as { files?: Array<{ id: string }> };
  return j.files?.[0]?.id ?? null;
}

async function driveUpload(folderId: string, name: string, body: string): Promise<{ id: string; name: string }> {
  const boundary = "----lovable-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "text/csv" });
  const payload =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: text/csv\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fetch(
    `${DRIVE_GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
    {
      method: "POST",
      headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    },
  );
  if (!r.ok) throw new Error(`Drive upload failed (${r.status}): ${await r.text()}`);
  return (await r.json()) as { id: string; name: string };
}

async function driveUpdate(fileId: string, body: string): Promise<{ id: string; name: string }> {
  const r = await fetch(
    `${DRIVE_GATEWAY}/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name`,
    { method: "PATCH", headers: { ...driveHeaders(), "Content-Type": "text/csv" }, body },
  );
  if (!r.ok) throw new Error(`Drive update failed (${r.status}): ${await r.text()}`);
  return (await r.json()) as { id: string; name: string };
}

export const pushGeneratedRunListToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    run_list_id: z.string().uuid(),
    filename: z.string().min(1),
    csv: z.string().min(1),
    instrument_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: inst } = await context.supabase
      .from("inventory_items")
      .select("drive_sequences_folder_id")
      .eq("id", data.instrument_id).maybeSingle();
    let folderId = (inst as { drive_sequences_folder_id: string | null } | null)?.drive_sequences_folder_id ?? null;
    if (!folderId) {
      const { data: settings } = await context.supabase
        .from("openlab_settings")
        .select("drive_sequences_folder_id")
        .limit(1).maybeSingle();
      folderId = (settings as { drive_sequences_folder_id: string | null } | null)?.drive_sequences_folder_id ?? null;
    }
    if (!folderId) {
      throw new Error("No Drive folder configured. Set a Drive folder ID on the instrument (Inventory → Instruments) or in OpenLab Settings.");
    }
    const existingId = await driveFindByName(folderId, data.filename);
    const uploaded = existingId
      ? await driveUpdate(existingId, data.csv)
      : await driveUpload(folderId, data.filename, data.csv);
    await context.supabase.from("openlab_drive_pushes").insert({
      run_list_id: data.run_list_id,
      drive_file_id: uploaded.id,
      drive_file_name: uploaded.name,
      pushed_by: context.userId,
    });
    return { ok: true, drive_file_id: uploaded.id, drive_file_name: uploaded.name };
  });
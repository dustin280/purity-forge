/**
 * Run List Generator: preview + persist optimized sequences and export
 * an OpenLab CDS-friendly CSV.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { optimize, type OptimizedSequence, type OptimizerSample } from "./optimizer";

const previewInput = z.object({ instrument_id: z.string().uuid() });

async function loadContext(supabase: any, instrumentId: string) {
  const [{ data: instrument }, { data: methodGroups }, { data: samples }] = await Promise.all([
    supabase.from("inventory_items")
      .select("id,instrument_name,make,model,default_method_folder,tray_config_id,instrument_status,drive_folder_id")
      .eq("id", instrumentId).maybeSingle(),
    supabase.from("method_groups").select("*").eq("is_active", true).order("priority"),
    supabase.from("samples")
      .select("id,batch_id,compound,method_group_id,status,lot,concentration")
      .eq("status", "received"),
  ]);
  if (!instrument) throw new Error("Instrument not found");
  const trayId = (instrument as { tray_config_id: string | null }).tray_config_id;
  const trayRes = trayId
    ? await supabase.from("tray_positions")
        .select("position_code,is_ref_vial,status,drawer,row_label,col_num")
        .eq("tray_config_id", trayId).eq("status", "available")
        .order("is_ref_vial", { ascending: true })
        .order("drawer").order("row_label").order("col_num")
    : { data: [] as Array<{ position_code: string; is_ref_vial: boolean }> };
  return {
    instrument: instrument as {
      id: string; instrument_name: string | null; make: string | null; model: string | null;
      default_method_folder: string | null; tray_config_id: string | null;
      drive_folder_id: string | null;
    },
    methodGroups: (methodGroups ?? []) as Array<{
      id: string; name: string; temperature_c: number; priority: number;
      default_acquisition_method: string | null; default_processing_method: string | null;
    }>,
    samples: (samples ?? []) as OptimizerSample[],
    trayPositions: (trayRes.data ?? []) as Array<{ position_code: string; is_ref_vial: boolean }>,
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
    return { instrument: ctx.instrument, sequences, sample_count: ctx.samples.length };
  });

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

function sequenceToCsv(
  seq: OptimizedSequence,
  injectionVolumeUL: number | "method",
  methodFolder: string | null,
): string {
  const headers = [
    "Sample name", "Sample type", "Vial", "Volume",
    "Acq Method", "Proc Method", "Data file", "Description", "Level",
  ];
  const volumeCell = injectionVolumeUL === "method" ? "" : String(injectionVolumeUL);
  const rows = seq.rows.map((r) => {
    const desc = r.method_group_name ?? "";
    // Instrument-facing sample name: SYX ID + "_" + Lot (Lot omitted if missing).
    // QC rows keep their label as-is.
    const isSample = r.type === "Sample";
    const sampleName = isSample
      ? (r.lot ? `${r.label.split(" — ")[0].split(" (Lot")[0]}_${r.lot}` : r.label.split(" — ")[0].split(" (Lot")[0])
      : r.label;
    return [
      sampleName,
      mapSampleType(r.type),
      r.vial ?? "",
      volumeCell,
      fullMethodPath(r.acquisition_method, methodFolder, "amx"),
      fullMethodPath(r.processing_method, methodFolder, "pmx"),
      "", // Data file — let OpenLab auto-generate
      desc,
      "", // Level — not tracked yet
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
    })).min(1),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: inst } = await context.supabase
      .from("inventory_items")
      .select("id,instrument_name,make,model,default_method_folder,drive_folder_id")
      .eq("id", data.instrument_id).maybeSingle();
    if (!inst) throw new Error("Instrument not found");
    const instRow = inst as {
      instrument_name: string | null; make: string | null; model: string | null;
      default_method_folder: string | null; drive_folder_id: string | null;
    };
    const instName = instRow.instrument_name
      ?? [instRow.make, instRow.model].filter(Boolean).join(" ")
      ?? "Instrument";
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const dayStr = `${yyyy}-${mm}-${dd}`;
    const instrumentKey = instName.replace(/\s+/g, "_");
    const { data: seqNum, error: seqErr } = await context.supabase
      .rpc("next_run_list_seq", { p_instrument_key: instrumentKey, p_day: dayStr });
    if (seqErr) throw seqErr;
    const runNum = String(seqNum as number).padStart(2, "0");
    const filename = `${dayStr}_${instrumentKey}_Run${runNum}.csv`;

    const seq: OptimizedSequence = {
      index: data.sequence_index,
      name: filename,
      primary_group_id: null,
      temperature_c: null,
      rows: data.rows.map((r) => ({
        type: r.type, label: r.label, sample_id: r.sample_id, lot: r.lot ?? null,
        method_group_id: null, method_group_name: null,
        acquisition_method: r.acquisition_method, processing_method: r.processing_method,
        vial: r.vial, why: "",
      })),
    };
    const csv = sequenceToCsv(seq, data.injection_volume_ul, instRow.default_method_folder);
    const csvWithBom = "\uFEFF" + csv;

    // Persist as a run_lists + run_list_items record for history/audit
    const { data: rl, error: rlErr } = await context.supabase.from("run_lists").insert({
      name: filename,
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
      vial: null,                 // tray-style codes don't fit the legacy int column
      data_file: null,
      comment: r.vial ? `Position ${r.vial}` : null,
      extras: { position_code: r.vial, processing_method: r.processing_method },
    }));
    await context.supabase.from("run_list_items").insert(items);

    return {
      run_list_id: rl.id as string,
      filename,
      csv: csvWithBom,
      drive_folder_id: instRow.drive_folder_id,
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
      .select("drive_folder_id")
      .eq("id", data.instrument_id).maybeSingle();
    let folderId = (inst as { drive_folder_id: string | null } | null)?.drive_folder_id ?? null;
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
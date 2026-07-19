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
      .select("id,instrument_name,make,model,default_method_folder,tray_config_id,instrument_status")
      .eq("id", instrumentId).maybeSingle(),
    supabase.from("method_groups").select("*").eq("is_active", true).order("priority"),
    supabase.from("samples")
      .select("id,batch_id,compound,method_group_id,status")
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
    case "ICV": case "CCV": return "Standard";
    default: return "Sample";
  }
}

function sequenceToCsv(seq: OptimizedSequence, injectionVolumeUL: number): string {
  const headers = [
    "Sample Name", "Vial", "Sample Type",
    "Acquisition Method", "Processing Method",
    "Injection Volume (uL)", "Data File",
  ];
  const rows = seq.rows.map((r, i) => {
    const dataFile = `${r.label.replace(/[^A-Za-z0-9_-]+/g, "_")}_${String(i + 1).padStart(3, "0")}`;
    return [
      r.label, r.vial ?? "", mapSampleType(r.type),
      r.acquisition_method ?? "", r.processing_method ?? "",
      injectionVolumeUL, dataFile,
    ].map(csvEscape).join(",");
  });
  return [headers.join(","), ...rows].join("\r\n");
}

export const generateAndSaveRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    instrument_id: z.string().uuid(),
    sequence_index: z.number().int().min(1),
    injection_volume_ul: z.number().min(0.1).max(1000).default(10),
    // optional overrides posted from the review screen
    rows: z.array(z.object({
      type: z.enum(["NIB", "ICB", "ICV", "CCB", "CCV", "Sample"]),
      label: z.string(),
      sample_id: z.string().uuid().nullable(),
      vial: z.string().nullable(),
      acquisition_method: z.string().nullable(),
      processing_method: z.string().nullable(),
    })).min(1),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: inst } = await context.supabase
      .from("inventory_items")
      .select("id,instrument_name,make,model")
      .eq("id", data.instrument_id).maybeSingle();
    if (!inst) throw new Error("Instrument not found");
    const instName = (inst as { instrument_name: string | null; make: string | null; model: string | null })
      .instrument_name ?? [inst.make, inst.model].filter(Boolean).join(" ") ?? "Instrument";
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
        type: r.type, label: r.label, sample_id: r.sample_id,
        method_group_id: null, method_group_name: null,
        acquisition_method: r.acquisition_method, processing_method: r.processing_method,
        vial: r.vial, why: "",
      })),
    };
    const csv = sequenceToCsv(seq, data.injection_volume_ul);

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

    return { run_list_id: rl.id as string, filename, csv };
  });
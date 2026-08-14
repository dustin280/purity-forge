/**
 * Automated backpressure/flow/column-temperature watcher for the Daily
 * Backpressure Log. Scans the "Results" Drive folder for `.rslt` run
 * folders it hasn't imported yet, pulls the first injection's pressure,
 * flow, and column-temperature traces straight from the instrument's own
 * `.dx` files, and inserts one Daily Backpressure Log row per run — the
 * automated counterpart to the manual entry form, meant to run unattended
 * (hourly, via src/routes/api/cron/pressure-log.ts).
 *
 * Grain and value choices (see the approved plan for full rationale):
 *   - one row per result folder, using the earliest .dx (first injection)
 *     as the representative run, matching how manual entries already work.
 *   - backpressure/flow/column-temp are each the mean of the trace's first
 *     ~15 seconds — smooths injection-moment noise while still matching
 *     the manual form's own instruction to record "at the initiation of a
 *     run." Full-run pressure min/max are also stored for context.
 *   - dedup key is the result folder's Drive id (drive_result_folder_id),
 *     not the file id — reruns within an already-imported folder aren't
 *     re-imported.
 */
import JSZip from "jszip";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { driveListFolders, driveListDxFiles, driveDownload, loadResultsFolderId } from "./drive-results.functions";
import { parseInjectionManifest, parseAgilentIT, meanInWindow, minMax, type AgilentTrace } from "./agilent-trace";

type SupabaseClientLike = import("@supabase/supabase-js").SupabaseClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

const DEFAULT_INSTRUMENT_NAME = "Infinity III HPLC-DAD";
// "At the initiation of a run" window — matches the manual form's own
// instruction, wide enough to smooth injection-moment noise.
const INITIATION_WINDOW_MINUTES = 0.25;

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function average(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function readTrace(zip: JSZip, traceId: string): Promise<AgilentTrace | null> {
  const file = zip.file(`${traceId}.IT`);
  if (!file) return null;
  try {
    return parseAgilentIT(await file.async("arraybuffer"));
  } catch {
    return null;
  }
}

async function lookupInstalledColumn(
  supabase: SupabaseClientLike,
  instrumentName: string,
): Promise<{ id: string; name: string } | null> {
  const { data: instrument } = await supabase.from("instruments").select("id").eq("name", instrumentName).maybeSingle();
  if (!instrument) return null;
  const { data: column } = await supabase
    .from("hplc_columns")
    .select("id, name")
    .eq("installed_on_instrument_id", instrument.id)
    .maybeSingle();
  return column ?? null;
}

export interface PressureWatcherResult {
  foldersScanned: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function runPressureWatcher({ supabase }: { supabase: SupabaseClientLike }): Promise<PressureWatcherResult> {
  const folderId = await loadResultsFolderId(supabase);
  const folders = await driveListFolders(folderId);

  const { data: already } = await supabase
    .from("daily_backpressure_logs")
    .select("drive_result_folder_id")
    .not("drive_result_folder_id", "is", null);
  const seen = new Set((already ?? []).map((r: { drive_result_folder_id: string | null }) => r.drive_result_folder_id));

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const folder of folders) {
    if (seen.has(folder.id)) {
      skipped++;
      continue;
    }
    try {
      const dxFiles = await driveListDxFiles(folder.id);
      if (dxFiles.length === 0) {
        skipped++;
        continue;
      }
      const first = dxFiles[0];
      const bytes = await driveDownload(first.id);
      const zip = await JSZip.loadAsync(bytes);

      const acmdFile = zip.file("injection.acmd");
      if (!acmdFile) {
        errors.push(`${folder.name}: no injection.acmd in ${first.name}`);
        continue;
      }
      const manifest = parseInjectionManifest(await acmdFile.async("text"));

      const pressureSig = manifest.signals.find((s) => s.device === "PMP" && /pressure/i.test(s.desc));
      if (!pressureSig) {
        errors.push(`${folder.name}: no pressure channel in manifest`);
        continue;
      }
      const pressureTrace = await readTrace(zip, pressureSig.traceId);
      if (!pressureTrace || pressureTrace.vals.length === 0) {
        errors.push(`${folder.name}: pressure trace missing or empty`);
        continue;
      }
      const backpressure = meanInWindow(pressureTrace, INITIATION_WINDOW_MINUTES);
      if (backpressure === null) {
        errors.push(`${folder.name}: could not compute backpressure`);
        continue;
      }

      const flowSig = manifest.signals.find((s) => s.device === "PMP" && /flow/i.test(s.desc));
      const flowTrace = flowSig ? await readTrace(zip, flowSig.traceId) : null;
      const flowRate = flowTrace ? meanInWindow(flowTrace, INITIATION_WINDOW_MINUTES) : null;

      const tempSigs = manifest.signals.filter((s) => s.device === "THM" && /temperature/i.test(s.desc));
      const tempTraces = (await Promise.all(tempSigs.map((s) => readTrace(zip, s.traceId)))).filter(
        (t): t is AgilentTrace => t !== null,
      );
      const tempReadings = tempTraces
        .map((t) => meanInWindow(t, INITIATION_WINDOW_MINUTES))
        .filter((v): v is number => v !== null);
      const columnTemp = average(tempReadings);

      const { min: pressureMin, max: pressureMax } = minMax(pressureTrace.vals);

      const installedColumn = await lookupInstalledColumn(supabase, DEFAULT_INSTRUMENT_NAME);
      if (installedColumn) {
        await supabase.rpc("increment_hplc_column_injections", {
          p_column_id: installedColumn.id,
          p_count: dxFiles.length,
        });
      }

      const { error: insertError } = await supabase.from("daily_backpressure_logs").insert({
        reading_at: manifest.runDateTime ?? new Date().toISOString(),
        user_name: "Automated Watcher",
        instrument: DEFAULT_INSTRUMENT_NAME,
        backpressure,
        backpressure_unit: "bar",
        flow_rate: flowRate,
        flow_rate_unit: flowRate !== null ? "mL/min" : null,
        column_temp: columnTemp,
        column_temp_unit: columnTemp !== null ? "C" : null,
        column_name: installedColumn?.name ?? null,
        injections_count: dxFiles.length,
        acquisition_method: manifest.acquisitionMethod ? basename(manifest.acquisitionMethod) : null,
        source: "auto",
        notes: `Auto-imported from ${folder.name} / ${first.name}`,
        pressure_run_min: pressureMin,
        pressure_run_max: pressureMax,
        drive_result_folder_id: folder.id,
        drive_dx_file_id: first.id,
      });
      if (insertError) {
        errors.push(`${folder.name}: ${insertError.message}`);
        continue;
      }
      imported++;
    } catch (e) {
      errors.push(`${folder.name}: ${(e as Error).message}`);
    }
  }

  return { foldersScanned: folders.length, imported, skipped, errors };
}

export const runPressureWatcherNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return runPressureWatcher({ supabase: context.supabase });
  });

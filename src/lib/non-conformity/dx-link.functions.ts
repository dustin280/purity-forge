/**
 * Links a Non-Conformity evaluation to its raw Agilent .dx instrument file
 * in Drive, so a future pass can pull real DAD spectral data out of it.
 * Reuses the exact Drive-fetch/unzip/manifest-parse pattern already
 * established by the hourly backpressure watcher
 * (src/lib/lab-logs/drive-results.functions.ts, src/lib/lab-logs/agilent-trace.ts)
 * rather than duplicating it. Read-only against Drive and nc_evaluations —
 * never writes to results/tests/samples.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  driveListFolders,
  driveListDxFiles,
  driveDownload,
  loadResultsFolderId,
  type DriveEntry,
} from "@/lib/lab-logs/drive-results.functions";
import {
  parseInjectionManifest,
  parseAgilentIT,
  type AgilentSignal,
  type InjectionManifest,
} from "@/lib/lab-logs/agilent-trace";
import type { AnySupabase } from "./supabase-any";

export const listDxFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const folderId = await loadResultsFolderId(context.supabase as AnySupabase);
    return driveListFolders(folderId);
  });

export const listDxFilesInFolder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ folder_id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => driveListDxFiles(data.folder_id));

export interface DadSignalProbe {
  signal: AgilentSignal;
  ok: boolean;
  pointCount?: number;
  rtRange?: [number, number];
  valsSample?: number[];
  error?: string;
}

export interface DxInspection {
  file_id: string;
  sample_name: string | null;
  run_date_time: string | null;
  run_operator: string | null;
  acquisition_method: string | null;
  signals: AgilentSignal[];
  dad_guess: DadSignalProbe[];
}

/** Filters the manifest's signal list for anything that looks DAD-related — the investigative guess this whole module exists to confirm or refute against real data. */
function guessDadSignals(signals: AgilentSignal[]): AgilentSignal[] {
  return signals.filter((s) => /dad/i.test(s.device) || /dad/i.test(s.channel));
}

async function probeSignal(zip: JSZip, signal: AgilentSignal): Promise<DadSignalProbe> {
  const traceFile = zip.file(`${signal.traceId}.IT`);
  if (!traceFile) return { signal, ok: false, error: `No ${signal.traceId}.IT file in archive` };
  try {
    const trace = parseAgilentIT(await traceFile.async("arraybuffer"));
    const n = trace.rt.length;
    return {
      signal,
      ok: true,
      pointCount: n,
      rtRange: n > 0 ? [trace.rt[0], trace.rt[n - 1]] : [0, 0],
      valsSample: trace.vals.slice(0, 5),
    };
  } catch (e) {
    return { signal, ok: false, error: (e as Error).message };
  }
}

async function inspectDxBytes(fileId: string, bytes: ArrayBuffer): Promise<DxInspection> {
  const zip = await JSZip.loadAsync(bytes);
  const acmdFile = zip.file("injection.acmd");
  if (!acmdFile) throw new Error("No injection.acmd manifest found in this .dx file.");
  const manifest = parseInjectionManifest(await acmdFile.async("text"));
  const dadGuess = await Promise.all(
    guessDadSignals(manifest.signals).map((s) => probeSignal(zip, s)),
  );
  return {
    file_id: fileId,
    sample_name: manifest.sampleName,
    run_date_time: manifest.runDateTime,
    run_operator: manifest.runOperator,
    acquisition_method: manifest.acquisitionMethod,
    signals: manifest.signals,
    dad_guess: dadGuess,
  };
}

export const inspectDxFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const bytes = await driveDownload(data.file_id);
    return inspectDxBytes(data.file_id, bytes);
  });

const resolveInput = z.object({
  sample_id: z.string().uuid(),
  result_id: z.string().uuid().nullable(),
  compound_name: z.string().nullable(),
  analysis_date: z.string().nullable(),
});

export type DxResolution =
  | {
      confidence: "auto";
      dx_file_id: string;
      dx_folder_id: string | null;
      manifest_sample_name: string | null;
      run_date_time: string | null;
      /** True when this reuses a file already linked to a prior evaluation of the same result, rather than a fresh Drive search. */
      reused: boolean;
    }
  | { confidence: "none" };

const CANDIDATE_FOLDER_LIMIT = 5;
const DATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Best-effort, never-blocking auto-match: reuses a prior evaluation's linked
 * file if one exists, otherwise searches the Results Drive folder for a
 * folder near the result's analysis_date whose manifest sample name looks
 * related. Any failure here (missing Drive config, unreadable folder, no
 * match) resolves to { confidence: "none" } rather than throwing — the
 * Non-Conformity evaluation must never be blocked by this.
 */
export const resolveDxFileForSample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resolveInput.parse(d))
  .handler(async ({ context, data }): Promise<DxResolution> => {
    const supabase = context.supabase as AnySupabase;

    if (data.result_id) {
      const { data: prior } = await supabase
        .from("nc_evaluations")
        .select("dx_file_id, dx_folder_id")
        .eq("result_id", data.result_id)
        .not("dx_file_id", "is", null)
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.dx_file_id) {
        return {
          confidence: "auto",
          dx_file_id: prior.dx_file_id,
          dx_folder_id: prior.dx_folder_id ?? null,
          manifest_sample_name: null,
          run_date_time: null,
          reused: true,
        };
      }
    }

    if (!data.analysis_date) return { confidence: "none" };
    const targetMs = new Date(data.analysis_date).getTime();
    if (Number.isNaN(targetMs)) return { confidence: "none" };

    try {
      const folderId = await loadResultsFolderId(supabase);
      const folders = await driveListFolders(folderId);
      const candidates = folders
        .filter(
          (f: DriveEntry) =>
            f.modifiedTime &&
            Math.abs(new Date(f.modifiedTime).getTime() - targetMs) <= DATE_WINDOW_MS,
        )
        .slice(0, CANDIDATE_FOLDER_LIMIT);
      if (candidates.length === 0) return { confidence: "none" };

      const compoundLower = data.compound_name?.trim().toLowerCase() ?? "";
      let best: {
        file: DriveEntry;
        folder: DriveEntry;
        manifest: InjectionManifest;
        score: number;
      } | null = null;

      for (const folder of candidates) {
        const dxFiles = await driveListDxFiles(folder.id);
        const first = dxFiles[0];
        if (!first) continue;
        try {
          const bytes = await driveDownload(first.id);
          const zip = await JSZip.loadAsync(bytes);
          const acmdFile = zip.file("injection.acmd");
          if (!acmdFile) continue;
          const manifest = parseInjectionManifest(await acmdFile.async("text"));
          const sampleNameLower = manifest.sampleName?.toLowerCase() ?? "";
          const nameMatches =
            compoundLower !== "" &&
            sampleNameLower !== "" &&
            (sampleNameLower.includes(compoundLower) || compoundLower.includes(sampleNameLower));
          const runMs = manifest.runDateTime ? new Date(manifest.runDateTime).getTime() : NaN;
          const dateCloseness = Number.isNaN(runMs) ? Infinity : Math.abs(runMs - targetMs);
          const score = (nameMatches ? 0 : 1) + dateCloseness / DATE_WINDOW_MS;
          if (!best || score < best.score) best = { file: first, folder, manifest, score };
        } catch {
          // Unreadable folder — best-effort only, skip and keep searching.
        }
      }

      if (!best) return { confidence: "none" };
      return {
        confidence: "auto",
        dx_file_id: best.file.id,
        dx_folder_id: best.folder.id,
        manifest_sample_name: best.manifest.sampleName,
        run_date_time: best.manifest.runDateTime,
        reused: false,
      };
    } catch {
      return { confidence: "none" };
    }
  });

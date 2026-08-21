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
  parseAgilentChDelta,
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
  /** Temporary diagnostic — only populated when a `.UV`/`.UVD` full-spectrum
   * pair is found (DAD1I), to figure out the real format against production
   * data before writing a parser. Remove once confirmed. */
  uvDebug?: {
    contentTypesXml: string | null;
    relsXml: string | null;
    uvSize: number;
    uvdSize: number;
    uvHexHeader: string;
    uvHexAt6144: string;
    uvdHexHeader: string;
    uvdHexTail: string;
  };
}

export interface DxInspection {
  file_id: string;
  sample_name: string | null;
  run_date_time: string | null;
  run_operator: string | null;
  acquisition_method: string | null;
  signals: AgilentSignal[];
  dad_guess: DadSignalProbe[];
  /** Every file name actually present in the .dx zip archive — the ground truth for whatever naming convention DAD signal files really use, since not every signal's traceId resolves to a `${traceId}.IT` file (see dad_guess). */
  zip_entries: string[];
}

/** Filters the manifest's signal list for anything that looks DAD-related — the investigative guess this whole module exists to confirm or refute against real data. */
function guessDadSignals(signals: AgilentSignal[]): AgilentSignal[] {
  return signals.filter((s) => /dad/i.test(s.device) || /dad/i.test(s.channel));
}

function traceToProbeResult(
  signal: AgilentSignal,
  trace: { rt: number[]; vals: number[] },
): DadSignalProbe {
  const n = trace.rt.length;
  return {
    signal,
    ok: true,
    pointCount: n,
    rtRange: n > 0 ? [trace.rt[0], trace.rt[n - 1]] : [0, 0],
    valsSample: trace.vals.slice(0, 5),
  };
}

/**
 * `.CH` channels store no reliable per-point timestamp or RT-bounds header
 * field of their own (see the parser's comment in agilent-trace.ts — this
 * was confirmed by direct inspection of a real file's header bytes, not
 * assumed). Every DAD channel in one `.dx` archive is acquired over the
 * same run window, so this finds any co-located DAD housekeeping channel
 * (lamp voltage / optical / board temperature — always `.IT`, always
 * present, already proven correct against real data) and reuses its real,
 * per-point timestamped RT range as the shared time base for every `.CH`
 * channel in the same archive.
 */
export async function resolveDadRtBoundsMin(
  zip: JSZip,
  signals: AgilentSignal[],
): Promise<[number, number] | null> {
  for (const signal of guessDadSignals(signals)) {
    const itFile = zip.file(`${signal.traceId}.IT`);
    if (!itFile) continue;
    try {
      const trace = parseAgilentIT(await itFile.async("arraybuffer"));
      if (trace.rt.length > 1) return [trace.rt[0], trace.rt[trace.rt.length - 1]];
    } catch {
      // Try the next housekeeping channel.
    }
  }
  return null;
}

function hexDump(view: DataView, start: number, len: number): string {
  const bytes: string[] = [];
  for (let i = 0; i < len && start + i < view.byteLength; i++) {
    bytes.push(
      view
        .getUint8(start + i)
        .toString(16)
        .padStart(2, "0"),
    );
  }
  return bytes.join(" ");
}

/**
 * DAD1I (the full-spectrum channel) resolves to a `.UV`/`.UVD` pair with an
 * accompanying `_rels/{traceId}.UV.rels` sidecar — confirmed live against a
 * real .dx file, but the byte format inside `.UV`/`.UVD` is unverified
 * (unlike `.CH`, no reference source was found describing this OpenLab-
 * specific variant). The `.rels` file and `[Content_Types].xml` are plain
 * XML (OPC packaging convention) and may name the real content type of
 * each part directly — reading them, plus a header hex dump of both binary
 * parts, is the same "ship a diagnostic, inspect real bytes live" step
 * that found the real `.CH` format this session, applied to `.UV` next.
 */
async function debugUvParts(
  zip: JSZip,
  traceId: string,
): Promise<NonNullable<DadSignalProbe["uvDebug"]> | null> {
  const uvFile = zip.file(`${traceId}.UV`);
  const uvdFile = zip.file(`${traceId}.UVD`);
  if (!uvFile || !uvdFile) return null;
  const [uvBuf, uvdBuf] = await Promise.all([
    uvFile.async("arraybuffer"),
    uvdFile.async("arraybuffer"),
  ]);
  const contentTypesFile = zip.file("[Content_Types].xml");
  const relsFile = zip.file(`_rels/${traceId}.UV.rels`);
  const uvView = new DataView(uvBuf);
  const uvdView = new DataView(uvdBuf);
  return {
    contentTypesXml: contentTypesFile ? await contentTypesFile.async("text") : null,
    relsXml: relsFile ? await relsFile.async("text") : null,
    uvSize: uvBuf.byteLength,
    uvdSize: uvdBuf.byteLength,
    // .rels confirms .UVD is a "spectradirectory" (index) into .UV — dump
    // enough of .UVD to spot a repeating fixed-size record, and .UV both
    // near the start (where .IT/.CH keep their real header fields, e.g.
    // .IT's version tag at 0 and scaling factor at 4732) and around the
    // 6144-byte mark (the header length both .IT and .CH share) to check
    // whether that convention carries over here too.
    uvHexHeader: hexDump(uvView, 0, 512),
    uvHexAt6144: hexDump(uvView, 6144, 256),
    uvdHexHeader: hexDump(uvdView, 0, 640),
    uvdHexTail: hexDump(uvdView, Math.max(0, uvdBuf.byteLength - 256), 256),
  };
}

async function probeSignal(
  zip: JSZip,
  signal: AgilentSignal,
  chRtBoundsMin: [number, number] | null,
): Promise<DadSignalProbe> {
  const itFile = zip.file(`${signal.traceId}.IT`);
  if (itFile) {
    try {
      return traceToProbeResult(signal, parseAgilentIT(await itFile.async("arraybuffer")));
    } catch (e) {
      return { signal, ok: false, error: (e as Error).message };
    }
  }
  const chFile = zip.file(`${signal.traceId}.CH`);
  if (chFile) {
    try {
      const buf = await chFile.async("arraybuffer");
      return traceToProbeResult(signal, parseAgilentChDelta(buf, chRtBoundsMin ?? undefined));
    } catch (e) {
      return { signal, ok: false, error: (e as Error).message };
    }
  }
  const uvDebug = await debugUvParts(zip, signal.traceId);
  if (uvDebug) {
    return {
      signal,
      ok: false,
      error: `Found ${signal.traceId}.UV/.UVD (full-spectrum) — format not yet parsed`,
      uvDebug,
    };
  }
  return { signal, ok: false, error: `No ${signal.traceId}.IT or .CH file in archive` };
}

async function inspectDxBytes(fileId: string, bytes: ArrayBuffer): Promise<DxInspection> {
  const zip = await JSZip.loadAsync(bytes);
  const acmdFile = zip.file("injection.acmd");
  if (!acmdFile) throw new Error("No injection.acmd manifest found in this .dx file.");
  const manifest = parseInjectionManifest(await acmdFile.async("text"));
  const chRtBoundsMin = await resolveDadRtBoundsMin(zip, manifest.signals);
  const dadGuess = await Promise.all(
    guessDadSignals(manifest.signals).map((s) => probeSignal(zip, s, chRtBoundsMin)),
  );
  const zipEntries = Object.keys(zip.files).sort();
  return {
    file_id: fileId,
    zip_entries: zipEntries,
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

const CANDIDATE_FOLDER_LIMIT = 8;
const CANDIDATE_FILE_LIMIT = 15;
/** Batch size for the file-inspection loop below — bounded rather than
 * firing all CANDIDATE_FILE_LIMIT downloads at once, since the
 * connector-gateway's own concurrency tolerance is unknown; a failed
 * download in a batch just drops that one candidate (existing per-file
 * try/catch), never the whole search. */
const FILE_INSPECT_CONCURRENCY = 5;
const DATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Best-effort, never-blocking auto-match: reuses a prior evaluation's linked
 * file if one exists, otherwise searches the Results Drive folder for a
 * folder near the result's analysis_date whose manifest sample name looks
 * related. Any failure here (missing Drive config, unreadable folder, no
 * match) resolves to { confidence: "none" } rather than throwing — the
 * Non-Conformity evaluation must never be blocked by this.
 *
 * A run folder holds one `.dx` per sample injected that day (confirmed live:
 * a real "001 ER 6 Samples 8-17-26" folder held 6). This previously only
 * ever inspected `dxFiles[0]` per candidate folder — since
 * driveListDxFiles sorts by filename, and filenames are timestamp-prefixed,
 * that's always the FIRST injection of the day, never the 2nd-6th. Any
 * sample that wasn't literally the first one run that day was structurally
 * invisible to the matcher, which then fell back to whatever wrong file it
 * did check scored best by date — confirmed live: it picked a same-window
 * but unrelated file instead of the real one sitting un-inspected 4 slots
 * later in its own correct folder. Now every file's own timestamp (more
 * precise than the folder's `modifiedTime`) is used to rank ALL files
 * across every candidate folder, and the closest CANDIDATE_FILE_LIMIT of
 * them are actually opened and name-matched, so a same-day sibling sample
 * can no longer hide the right file from the search.
 *
 * Second bug found alongside the first (same live re-test): the folder
 * candidate list was filtered to the date window but never re-sorted by
 * closeness before `.slice(0, CANDIDATE_FOLDER_LIMIT)` — it stayed in
 * Drive's own "most recently touched, globally" order, so on a day with
 * more in-window folders than the limit, the actually-closest folder could
 * still get cut if some other in-window folder happened to have a more
 * recent Drive `modifiedTime` for unrelated reasons. Folders are now
 * sorted by closeness to the target date before the slice, same principle
 * as the file-level fix above; the limit was also raised 5→8 for margin.
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
        .sort(
          (a, b) =>
            Math.abs(new Date(a.modifiedTime!).getTime() - targetMs) -
            Math.abs(new Date(b.modifiedTime!).getTime() - targetMs),
        )
        .slice(0, CANDIDATE_FOLDER_LIMIT);
      if (candidates.length === 0) return { confidence: "none" };

      const compoundLower = data.compound_name?.trim().toLowerCase() ?? "";

      const filesByFolder = await Promise.all(
        candidates.map(async (folder) => {
          try {
            return { folder, files: await driveListDxFiles(folder.id) };
          } catch {
            return { folder, files: [] as DriveEntry[] };
          }
        }),
      );
      const allFiles = filesByFolder
        .flatMap(({ folder, files }) => files.map((file) => ({ folder, file })))
        .filter(({ file }) => file.modifiedTime)
        .sort(
          (a, b) =>
            Math.abs(new Date(a.file.modifiedTime!).getTime() - targetMs) -
            Math.abs(new Date(b.file.modifiedTime!).getTime() - targetMs),
        )
        .slice(0, CANDIDATE_FILE_LIMIT);

      type Candidate = {
        file: DriveEntry;
        folder: DriveEntry;
        manifest: InjectionManifest;
        score: number;
      };

      async function inspectCandidate({
        folder,
        file,
      }: {
        folder: DriveEntry;
        file: DriveEntry;
      }): Promise<Candidate | null> {
        try {
          const bytes = await driveDownload(file.id);
          const zip = await JSZip.loadAsync(bytes);
          const acmdFile = zip.file("injection.acmd");
          if (!acmdFile) return null;
          const manifest = parseInjectionManifest(await acmdFile.async("text"));
          const sampleNameLower = manifest.sampleName?.toLowerCase() ?? "";
          const nameMatches =
            compoundLower !== "" &&
            sampleNameLower !== "" &&
            (sampleNameLower.includes(compoundLower) || compoundLower.includes(sampleNameLower));
          const runMs = manifest.runDateTime ? new Date(manifest.runDateTime).getTime() : NaN;
          const dateCloseness = Number.isNaN(runMs) ? Infinity : Math.abs(runMs - targetMs);
          const score = (nameMatches ? 0 : 1) + dateCloseness / DATE_WINDOW_MS;
          return { file, folder, manifest, score };
        } catch {
          // Unreadable file — best-effort only, skip and keep searching.
          return null;
        }
      }

      let best: Candidate | null = null;
      for (let i = 0; i < allFiles.length; i += FILE_INSPECT_CONCURRENCY) {
        const batch = allFiles.slice(i, i + FILE_INSPECT_CONCURRENCY);
        const results = await Promise.all(batch.map(inspectCandidate));
        for (const candidate of results) {
          if (candidate && (!best || candidate.score < best.score)) best = candidate;
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

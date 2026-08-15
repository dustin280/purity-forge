/**
 * Automated Cal Std / QC Check peak-area/RT trend watcher. Scans the
 * configured Drive folder(s) for `.rslt` sequence folders, reads each
 * sequence's `.acaml` manifest for injection metadata, and — for
 * injections the lab has already integrated in OpenLab CDS — pulls the
 * peak table from the matching per-injection `.rx` result package.
 *
 * `sample_type` ('cal_std' | 'qc_check') comes from each injection's own
 * ACAML `SampleType` attribute (Agilent's fixed vocabulary: "Sample",
 * "QC check", "Blank", "Calibration" — confirmed against a real Agilent
 * sequence-template reference), not from which folder it was found in.
 * That turned out to matter for two reasons: the lab's QC injections live
 * mixed into the same general Results folder as everything else rather
 * than a dedicated folder, and even the dedicated Cal Std folder has
 * non-calibration blank/equilibration injections mixed in that shouldn't
 * be logged as calibration readings. The two configured folders (which,
 * via Drive's multi-parent folders, can genuinely share the same
 * underlying `.rslt` sequence subfolders) are just where to look — every
 * injection is classified independently once found.
 *
 * Dedup is per Agilent InjectionId (Agilent's own stable UUID, extracted
 * from the manifest) — an injection skipped this run because it hadn't
 * been integrated yet is retried for free on the next hourly run, and a
 * sequence folder reachable from both configured folders is only ever
 * processed once.
 */
import JSZip from "jszip";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  driveListFolders,
  driveListByExt,
  driveDownload,
  loadCalStdFolderId,
  loadQcFolderId,
} from "./drive-results.functions";
import { parseSequenceManifest, parseInjectionResult, type AcamlInjection } from "./acaml";
import { matchCompound, extractConcentration } from "./cal-qc-matching";

type SupabaseClientLike = import("@supabase/supabase-js").SupabaseClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

function resultFileNameFor(injection: AcamlInjection): string | null {
  if (!injection.rawDataFileName) return null;
  return injection.rawDataFileName.replace(/\.dx$/i, ".rx");
}

/**
 * Agilent's SampleType vocabulary (confirmed): "Sample", "QC check",
 * "Blank", "Calibration". Substring/case-insensitive match rather than an
 * exact enum comparison — safer against minor casing/spacing variance
 * ("QC Check" vs "QC check") without a real example of every variant yet.
 */
function classifySampleType(acamlSampleType: string | null): "cal_std" | "qc_check" | null {
  if (!acamlSampleType) return null;
  const t = acamlSampleType.toLowerCase();
  if (t.includes("calibration")) return "cal_std";
  if (t.includes("qc")) return "qc_check";
  return null;
}

async function fetchInjectionAcaml(rxBytes: ArrayBuffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(rxBytes);
  const entry = zip.file("Base/InjectionACAML");
  if (!entry) return null;
  return entry.async("text");
}

export interface CalQcWatcherResult {
  imported: number;
  skippedNotIntegrated: number;
  skippedNoResultFile: number;
  skippedOtherSampleType: number;
  errors: string[];
}

export async function runCalQcWatcher({ supabase }: { supabase: SupabaseClientLike }): Promise<CalQcWatcherResult> {
  const [calFolderId, qcFolderId] = await Promise.all([loadCalStdFolderId(supabase), loadQcFolderId(supabase)]);
  // Both settings just say where to look — a sequence folder reachable via
  // both (Drive folders can have multiple parents) is only scanned once.
  const topFolderIds = Array.from(new Set([calFolderId, qcFolderId].filter((id): id is string => !!id)));

  const { data: already } = await supabase.from("cal_qc_peak_log").select("injection_id");
  const seenInjections = new Set((already ?? []).map((r: { injection_id: string }) => r.injection_id));

  let imported = 0;
  let skippedNotIntegrated = 0;
  let skippedNoResultFile = 0;
  let skippedOtherSampleType = 0;
  const errors: string[] = [];
  const scannedSequenceFolders = new Set<string>();

  for (const topFolderId of topFolderIds) {
    let sequenceFolders;
    try {
      sequenceFolders = await driveListFolders(topFolderId);
    } catch (e) {
      errors.push(`folder ${topFolderId}: ${(e as Error).message}`);
      continue;
    }

    for (const seqFolder of sequenceFolders) {
      if (scannedSequenceFolders.has(seqFolder.id)) continue;
      scannedSequenceFolders.add(seqFolder.id);

      try {
        const acamlFiles = await driveListByExt(seqFolder.id, "acaml");
        if (acamlFiles.length === 0) continue;
        const acamlBytes = await driveDownload(acamlFiles[0].id);
        const manifest = parseSequenceManifest(new TextDecoder("utf-8").decode(acamlBytes));

        const pendingInjections = manifest.injections.filter((inj) => !seenInjections.has(inj.injectionId));
        if (pendingInjections.length === 0) continue;

        const rxFiles = await driveListByExt(seqFolder.id, "rx");
        const rxByName = new Map(rxFiles.map((f) => [f.name, f]));

        for (const inj of pendingInjections) {
          const sampleType = classifySampleType(inj.sampleType);
          if (!sampleType) {
            skippedOtherSampleType++;
            continue;
          }

          const rxName = resultFileNameFor(inj);
          const rxFile = rxName ? rxByName.get(rxName) : undefined;
          if (!rxFile) {
            skippedNoResultFile++;
            continue;
          }
          const rxBytes = await driveDownload(rxFile.id);
          const injectionXml = await fetchInjectionAcaml(rxBytes);
          if (!injectionXml) {
            skippedNoResultFile++;
            continue;
          }
          const result = parseInjectionResult(injectionXml);
          if (!result.integrated) {
            skippedNotIntegrated++;
            continue;
          }

          const { value: concentration_level, unit: concentration_unit } = extractConcentration(inj.sampleName);

          for (const peak of result.peaks) {
            const { compoundId, confidence } = await matchCompound(supabase, peak.compound);
            const { error } = await supabase.from("cal_qc_peak_log").insert({
              sample_type: sampleType,
              compound_id: compoundId,
              raw_compound_name: peak.compound,
              match_confidence: confidence,
              sample_name: inj.sampleName,
              calibration_level: inj.calibrationLevel,
              concentration_level,
              concentration_unit,
              rt: peak.rt,
              area: peak.area,
              amount: peak.amount,
              reading_at: inj.acqDateTime ?? new Date().toISOString(),
              sequence_name: manifest.sequenceName ?? inj.sequenceName,
              injection_id: inj.injectionId,
              source_result_file_id: rxFile.id,
            });
            if (error) errors.push(`${inj.sampleName} / ${peak.compound}: ${error.message}`);
            else imported++;
          }
          seenInjections.add(inj.injectionId);
        }
      } catch (e) {
        errors.push(`${seqFolder.name}: ${(e as Error).message}`);
      }
    }
  }

  return { imported, skippedNotIntegrated, skippedNoResultFile, skippedOtherSampleType, errors };
}

export const runCalQcWatcherNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return runCalQcWatcher({ supabase: context.supabase });
  });

export const reassignCalQcCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ raw_compound_name: z.string().min(1), compound_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("cal_qc_peak_log")
      .update({ compound_id: data.compound_id, match_confidence: "exact" })
      .eq("raw_compound_name", data.raw_compound_name)
      .is("compound_id", null);
    if (error) throw error;
    return { ok: true };
  });

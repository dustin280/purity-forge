/**
 * Automated Cal Std / QC Check peak-area/RT trend watcher. Scans two
 * separate Drive folders (Cal Std, QC) for `.rslt` sequence folders, reads
 * each sequence's `.acaml` manifest for injection metadata, and — for
 * injections the lab has already integrated in OpenLab CDS — pulls the
 * peak table from the matching per-injection `.rx` result package.
 *
 * `sample_type` ('cal_std' | 'qc_check') is determined purely by which of
 * the two configured folders a sequence was found in — reliable, unlike
 * text-parsing a filename. Dedup is per Agilent InjectionId (Agilent's own
 * stable UUID, extracted from the manifest) — an injection skipped this run
 * because it hadn't been integrated yet is retried for free on the next
 * hourly run, no extra bookkeeping needed.
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
  errors: string[];
}

export async function runCalQcWatcher({ supabase }: { supabase: SupabaseClientLike }): Promise<CalQcWatcherResult> {
  const [calFolderId, qcFolderId] = await Promise.all([loadCalStdFolderId(supabase), loadQcFolderId(supabase)]);

  const { data: already } = await supabase.from("cal_qc_peak_log").select("injection_id");
  const seenInjections = new Set((already ?? []).map((r: { injection_id: string }) => r.injection_id));

  let imported = 0;
  let skippedNotIntegrated = 0;
  let skippedNoResultFile = 0;
  const errors: string[] = [];

  const folders: Array<["cal_std" | "qc_check", string | null]> = [
    ["cal_std", calFolderId],
    ["qc_check", qcFolderId],
  ];

  for (const [sampleType, folderId] of folders) {
    if (!folderId) continue;
    let sequenceFolders;
    try {
      sequenceFolders = await driveListFolders(folderId);
    } catch (e) {
      errors.push(`${sampleType} folder: ${(e as Error).message}`);
      continue;
    }

    for (const seqFolder of sequenceFolders) {
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
        }
      } catch (e) {
        errors.push(`${seqFolder.name}: ${(e as Error).message}`);
      }
    }
  }

  return { imported, skippedNotIntegrated, skippedNoResultFile, errors };
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

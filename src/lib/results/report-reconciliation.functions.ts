/**
 * Matches samples awaiting a result against the "LM-Reports Complete" Drive
 * folder and, for high-confidence matches, auto-inserts the result — this
 * is the automated counterpart to the single-file picker in
 * drive-reports.functions.ts, meant to run unattended (hourly, via
 * src/routes/api/cron/reconcile-reports.ts) rather than one file at a time.
 *
 * Matching rules were validated by hand against the real Drive folder this
 * session:
 *   - batch_id present in the filename, followed by a non-digit boundary
 *     (guards "SYX-000002-1" matching inside "SYX-000002-10") — high
 *     confidence, the only tier auto-applied without a human.
 *   - lot code present when batch_id is absent from the filename — lower
 *     confidence; NOT collision-proof (one lot code can be a substring of
 *     another's), so if the same file lot-matches more than one sample,
 *     all of them are marked "ambiguous" instead of guessing.
 *   - filenames containing "No COC" are walk-in samples that bypassed the
 *     intake portal — never expected to carry a batch_id, tracked
 *     separately rather than as a failed match.
 *   - multiple files matching one sample (reruns / "anomalous"-prefixed
 *     do-overs) — the newest by modifiedTime wins.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  driveList, driveDownload, pdfParse, loadReportsFolderId,
  parseReportText, compoundsToPeaks,
} from "./drive-reports.functions";

type SupabaseClientLike = import("@supabase/supabase-js").SupabaseClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

type FileEntry = { id: string; name: string; modifiedTime?: string };
type SampleEntry = { id: string; batch_id: string; compound: string | null; lot: string | null; status: string };
type MatchTier = "batch_id" | "lot_code" | "ambiguous" | "not_run";
type MatchedFile = { id: string; name: string; modified_time: string | null };
export type ReconciliationSample = {
  id: string; batch_id: string; compound: string | null; tier: MatchTier; file: MatchedFile | null;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function batchIdMatches(filename: string, batchId: string): boolean {
  return new RegExp(`${escapeRegex(batchId)}(?!\\d)`).test(filename);
}

function newest(files: FileEntry[]): FileEntry {
  return files.reduce((a, b) => ((b.modifiedTime ?? "") > (a.modifiedTime ?? "") ? b : a));
}

function computeMatches(samples: SampleEntry[], files: FileEntry[]): {
  samples: ReconciliationSample[]; noCocFiles: FileEntry[]; orphanFiles: FileEntry[];
} {
  const noCocFiles: FileEntry[] = [];
  const candidateFiles: FileEntry[] = [];
  for (const f of files) {
    (/no\s*coc/i.test(f.name) ? noCocFiles : candidateFiles).push(f);
  }

  const usedFileIds = new Set<string>();
  const out: ReconciliationSample[] = [];
  const matchedByBatchId = new Set<string>();

  // Tier 1: batch_id, with a non-digit boundary so "SYX-000002-1" can't
  // false-positive-match inside "SYX-000002-10".
  for (const s of samples) {
    const matches = candidateFiles.filter((f) => batchIdMatches(f.name, s.batch_id));
    if (matches.length === 0) continue;
    const best = newest(matches);
    out.push({ id: s.id, batch_id: s.batch_id, compound: s.compound, tier: "batch_id", file: { id: best.id, name: best.name, modified_time: best.modifiedTime ?? null } });
    usedFileIds.add(best.id);
    matchedByBatchId.add(s.id);
  }

  // Tier 2: lot code fallback for everything batch_id couldn't resolve.
  const remaining = samples.filter((s) => !matchedByBatchId.has(s.id));
  const lotMatchesBySample = new Map<string, FileEntry[]>();
  for (const s of remaining) {
    if (!s.lot) continue;
    const matches = candidateFiles.filter((f) => f.name.includes(s.lot as string));
    if (matches.length > 0) lotMatchesBySample.set(s.id, matches);
  }
  // Detect the real collision risk: the same file lot-matching more than
  // one distinct sample. Any sample involved becomes "ambiguous" rather
  // than silently picking a winner.
  const fileToSamples = new Map<string, Set<string>>();
  for (const [sampleId, matches] of lotMatchesBySample) {
    for (const f of matches) {
      const set = fileToSamples.get(f.id) ?? new Set<string>();
      set.add(sampleId);
      fileToSamples.set(f.id, set);
    }
  }
  const ambiguousSampleIds = new Set<string>();
  for (const set of fileToSamples.values()) {
    if (set.size > 1) for (const id of set) ambiguousSampleIds.add(id);
  }

  for (const s of remaining) {
    if (ambiguousSampleIds.has(s.id)) {
      out.push({ id: s.id, batch_id: s.batch_id, compound: s.compound, tier: "ambiguous", file: null });
      continue;
    }
    const matches = lotMatchesBySample.get(s.id);
    if (matches && matches.length > 0) {
      const best = newest(matches);
      out.push({ id: s.id, batch_id: s.batch_id, compound: s.compound, tier: "lot_code", file: { id: best.id, name: best.name, modified_time: best.modifiedTime ?? null } });
      usedFileIds.add(best.id);
    } else {
      out.push({ id: s.id, batch_id: s.batch_id, compound: s.compound, tier: "not_run", file: null });
    }
  }

  const orphanFiles = candidateFiles.filter((f) => !usedFileIds.has(f.id));
  return { samples: out, noCocFiles, orphanFiles };
}

/**
 * Downloads + parses one matched report and inserts a `results` row for
 * the sample, then best-effort bumps status the same way manual result
 * entry (submitResult) does — only from "prep" (the one status the
 * transition table allows moving to "in_progress" from); anything else
 * (already in_progress, already complete, etc.) is a silent no-op, not an
 * error, matching how this runs unattended.
 */
async function applyOneMatch(
  supabase: SupabaseClientLike,
  sample: { id: string; batch_id: string; status?: string },
  file: { id: string; name: string },
): Promise<void> {
  const { data: tests, error: testErr } = await supabase.from("tests").select("id").eq("sample_id", sample.id).limit(1);
  if (testErr) throw testErr;
  const testId = tests?.[0]?.id as string | undefined;
  if (!testId) throw new Error(`No test row for sample ${sample.batch_id}`);

  const bytes = await driveDownload(file.id);
  const { text } = await pdfParse(Buffer.from(bytes));
  const parsed = parseReportText(text);
  if (parsed.compounds.length === 0) throw new Error(`No compound rows parsed from ${file.name}`);
  const { peaks, purity } = compoundsToPeaks(parsed.compounds);
  const analysisDate = (() => {
    if (!parsed.analysis_date) return undefined;
    const d = new Date(parsed.analysis_date);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  })();

  const { error: insErr } = await supabase.from("results").insert({
    test_id: testId,
    purity_percentage: purity,
    peak_details: peaks,
    raw_data_file_path: `https://drive.google.com/file/d/${file.id}/view`,
    analysis_date: analysisDate,
    analyst_id: null,
  });
  if (insErr) throw insErr;

  if (sample.status === "prep") {
    try {
      await supabase.from("samples").update({ status: "in_progress" }).eq("id", sample.id);
    } catch { /* non-critical — result is saved either way */ }
  }
}

// Applies matches with bounded concurrency rather than firing every
// download+parse at once — a full backlog can be 100+ files, and blasting
// that many simultaneous requests at the Drive connector gateway risks
// rate-limiting that fails the whole batch together instead of a few.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runReconciliation({ supabase, autoApply }: {
  supabase: SupabaseClientLike; autoApply: boolean;
}): Promise<{
  applied: number; samples: ReconciliationSample[];
  no_coc_files: Array<{ id: string; name: string }>; orphan_files: Array<{ id: string; name: string }>;
  failed: Array<{ batch_id: string; file_name: string; error: string }>;
}> {
  const { data: allSamples, error: sErr } = await supabase
    .from("samples").select("id,batch_id,compound,lot,status").neq("status", "cancelled");
  if (sErr) throw sErr;
  if (!allSamples || allSamples.length === 0) return { applied: 0, samples: [], no_coc_files: [], orphan_files: [], failed: [] };

  const sampleIds = allSamples.map((s) => s.id as string);
  const { data: testRows, error: tErr } = await supabase.from("tests").select("id,sample_id").in("sample_id", sampleIds);
  if (tErr) throw tErr;
  const testIdBySample = new Map<string, string>();
  for (const t of testRows ?? []) {
    if (!testIdBySample.has(t.sample_id as string)) testIdBySample.set(t.sample_id as string, t.id as string);
  }
  const testIds = [...testIdBySample.values()];

  const { data: existingResults } = testIds.length
    ? await supabase.from("results").select("test_id").in("test_id", testIds)
    : { data: [] as Array<{ test_id: string }> };
  const testIdsWithResult = new Set((existingResults ?? []).map((r) => r.test_id as string));

  const eligible = allSamples.filter((s) => {
    const testId = testIdBySample.get(s.id as string);
    return testId && !testIdsWithResult.has(testId);
  }) as SampleEntry[];

  const folderId = await loadReportsFolderId(supabase);
  const files = await driveList(folderId);
  const { samples: matched, noCocFiles, orphanFiles } = computeMatches(eligible, files);

  let applied = 0;
  const failed: Array<{ batch_id: string; file_name: string; error: string }> = [];
  if (autoApply) {
    const toApply = matched.filter((m) => m.tier === "batch_id" && m.file);
    const eligibleById = new Map(eligible.map((s) => [s.id, s]));
    const outcomes = await mapWithConcurrency(toApply, 5, (m) =>
      applyOneMatch(supabase, { id: m.id, batch_id: m.batch_id, status: eligibleById.get(m.id)?.status }, m.file as MatchedFile)
    );
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") {
        applied++;
      } else {
        const m = toApply[i];
        const message = o.reason instanceof Error ? o.reason.message : String(o.reason);
        console.error("report reconciliation: apply failed", m.batch_id, message);
        failed.push({ batch_id: m.batch_id, file_name: m.file?.name ?? "", error: message });
      }
    });
  }

  return {
    applied,
    samples: matched,
    no_coc_files: noCocFiles.map((f) => ({ id: f.id, name: f.name })),
    orphan_files: orphanFiles.map((f) => ({ id: f.id, name: f.name })),
    failed,
  };
}

export const reconcileReportsReadOnly = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runReconciliation({ supabase: context.supabase, autoApply: false }));

export const runReconciliationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return runReconciliation({ supabase: context.supabase, autoApply: true });
  });

export const applyMatchedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sample_id: z.string().uuid(),
    file_id: z.string().min(1),
    file_name: z.string().min(1),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: sample, error } = await context.supabase
      .from("samples").select("id,batch_id,status").eq("id", data.sample_id).maybeSingle();
    if (error) throw error;
    if (!sample) throw new Error("Sample not found");
    await applyOneMatch(context.supabase, sample, { id: data.file_id, name: data.file_name });
    return { ok: true };
  });

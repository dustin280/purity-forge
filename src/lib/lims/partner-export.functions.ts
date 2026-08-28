/**
 * The per-sample payload shape Wayne's system consumes from
 * /api/public/exports/$batchId.ts, extracted so the Internal Lab Report
 * (src/lib/lims/coa-data.functions.ts) can build its per-vial data from the
 * exact same query -- one source of truth for "what does the partner
 * actually receive," instead of a second data-assembly path that could
 * silently drift out of sync with it. Also makes the internal report a
 * genuine "see what Wayne sees" debugging tool for partner-facing issues.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findVialPhotoDataUri } from "@/lib/lims/coc/vial-photo-drive-sync.functions";

type ExportConfig = {
  include_lcs: boolean;
  include_ccv: boolean;
  include_method_blank: boolean;
  include_calibration: boolean;
};

type SampleRow = {
  id: string; batch_id: string; client: string; project: string | null;
  receipt_date: string; status: string; notes: string | null; physical_description: string | null;
};

export type PartnerExportPayload = {
  batch_id: string;
  client: string;
  project: string | null;
  receipt_date: string;
  status: string;
  notes: string | null;
  vial_photo: string | null;
  tests: Array<{
    id: string; test_type: string; sub_id: string | null; method_name: string;
    instrument: string; parameters: unknown; status: "available" | "pending";
    day3_result?: string; day7_result?: string;
    results: Array<Record<string, unknown>>;
  }>;
  extras: Record<string, unknown>;
  generated_at: string;
};

export async function buildPartnerExportPayload(
  supabase: SupabaseClient,
  sample: SampleRow,
  cfg: ExportConfig,
): Promise<PartnerExportPayload> {
  const { data: tests } = await supabase.from("tests").select("*").eq("sample_id", sample.id);
  const testIds = (tests ?? []).map((t) => t.id);
  const results = testIds.length
    ? ((await supabase.from("results").select("*").in("test_id", testIds)).data ?? [])
    : [];

  const sterilityTestIds = (tests ?? []).filter((t) => t.test_type === "sterility").map((t) => t.id);
  const batchItemsByTestId = sterilityTestIds.length
    ? new Map(
        (await supabase.from("analysis_batch_items")
          .select("test_id, day3_status, day7_status").in("test_id", sterilityTestIds)
        ).data?.map((r) => [r.test_id, r]) ?? [],
      )
    : new Map<string, { day3_status: string; day7_status: string }>();
  const mapPreliminaryStatus = (s: string | undefined) =>
    s === "clear" ? "no_growth" : s === "turbid" ? "positive" : "pending";

  const nonchromResults = testIds.length
    ? ((await supabase.from("nonchrom_results").select("*").in("test_id", testIds)
        .order("analysis_date", { ascending: false })).data ?? [])
    : [];

  const userIds = Array.from(new Set(
    [...results, ...nonchromResults]
      .flatMap((r) => [r.analyst_id, r.reviewer_id])
      .filter((id): id is string => !!id),
  ));
  const profiles = userIds.length
    ? ((await supabase.from("profiles").select("id,full_name,first_name,last_name,email").in("id", userIds)).data ?? [])
    : [];
  const nameById = new Map(profiles.map((p) => {
    const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return [p.id, fl || p.full_name || p.email || null] as const;
  }));

  const approvedPurityResults = results.filter((r) => r.approved_at != null);
  const latestPurityResult = approvedPurityResults
    .slice()
    .sort((a, b) => +new Date(b.analysis_date) - +new Date(a.analysis_date))[0] ?? null;

  const extras: Record<string, unknown> = {};
  if (cfg.include_lcs) extras.lcs_recovery = null;
  if (cfg.include_ccv) extras.ccv_recovery = null;
  if (cfg.include_method_blank) extras.method_blank_spectra = null;
  if (cfg.include_calibration) extras.calibration_data = latestPurityResult?.calibration_data ?? null;

  const vialPhoto = await findVialPhotoDataUri(supabase, sample.batch_id);

  return {
    batch_id: sample.batch_id,
    client: sample.client,
    project: sample.project,
    receipt_date: sample.receipt_date,
    status: sample.status,
    notes: sample.notes,
    vial_photo: vialPhoto,
    tests: (tests ?? []).map((t) => {
      if (t.test_type === "purity") {
        const approvedForTest = approvedPurityResults.filter((r) => r.test_id === t.id);
        return {
          id: t.id, test_type: t.test_type, sub_id: t.sub_id, method_name: t.method_name,
          instrument: t.instrument, parameters: t.parameters,
          status: (approvedForTest.length ? "available" : "pending") as "available" | "pending",
          results: approvedForTest.map((r) => ({
            purity_percentage: r.purity_percentage,
            peak_details: r.peak_details,
            analysis_date: r.analysis_date,
            analyst_id: r.analyst_id,
            analyst_name: r.analyst_id ? nameById.get(r.analyst_id) ?? null : null,
            reviewer_id: r.reviewer_id,
            reviewer_name: r.reviewer_id ? nameById.get(r.reviewer_id) ?? null : null,
            approved_at: r.approved_at,
            chromatogram_png: r.chromatogram_image,
            calibration_png: r.calibration_image,
            calibration_data: r.calibration_data ?? null,
            calibration_curves: r.calibration_curves ?? null,
            appearance: sample.physical_description ?? null,
            uv_conf_match: r.uv_conf_match ?? null,
            wavelength_nm: r.wavelength_nm ?? null,
            report_metadata: r.report_metadata ?? null,
          })),
        };
      }
      const latest = nonchromResults.find((r) => r.test_id === t.id) ?? null;
      const batchItem = t.test_type === "sterility" ? batchItemsByTestId.get(t.id) : undefined;
      return {
        id: t.id, test_type: t.test_type, sub_id: t.sub_id, method_name: t.method_name,
        instrument: t.instrument, parameters: t.parameters,
        status: (latest ? "available" : "pending") as "available" | "pending",
        ...(t.test_type === "sterility" ? {
          day3_result: mapPreliminaryStatus(batchItem?.day3_status),
          day7_result: mapPreliminaryStatus(batchItem?.day7_status),
        } : {}),
        results: latest ? [{
          data: latest.data,
          analysis_date: latest.analysis_date,
          analyst_id: latest.analyst_id,
          analyst_name: latest.analyst_id ? nameById.get(latest.analyst_id) ?? null : null,
        }] : [],
      };
    }),
    extras,
    generated_at: new Date().toISOString(),
  };
}

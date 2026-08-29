/**
 * Data assembly for the Internal Lab Report PDF (src/lib/coa-pdf.ts). A
 * "report" covers every vial of one product from one CoC submission, not
 * just the single sample the user clicked from -- CoC intake explodes a
 * line item's vial_count into N sibling `samples` rows, each independently
 * tested (coc-intake.functions.ts), so building a per-vial table means
 * finding and aggregating across those siblings here.
 *
 * Grouping key: verified against real data (the SYX-000006 CoC) that
 * line_item_index is NOT shared across a product's vials (it's unique per
 * row) and compound name isn't reliably identical either (real typos exist
 * between vials of the same product). What IS consistent is the lot number
 * sharing a base prefix with a trailing per-vial suffix appended by
 * analysts (e.g. "53-162-SY-0826-1"/"-2"/"-3" for the three main vials,
 * "-EN"/"-ST" for their dedicated endotoxin/sterility add-on vials) -- an
 * observed lab convention, not a schema-enforced invariant, so a lot with
 * no such suffix just groups with itself.
 *
 * Per-vial data comes from buildPartnerExportPayload -- the exact same
 * per-sample query Wayne's system consumes from
 * /api/public/exports/$batchId.ts -- rather than a second, parallel
 * data-assembly path. One source of truth for "what data is available and
 * how it's shaped," and this report doubles as a way to see exactly what
 * the partner receives for a given sample.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPartnerExportPayload } from "@/lib/lims/partner-export.functions";
import { isUnassignedPeak, type Peak } from "@/lib/lims-utils";
import type { Json } from "@/integrations/supabase/types";

function lotBase(lot: string | null): string | null {
  if (!lot) return null;
  const idx = lot.lastIndexOf("-");
  return idx > 0 ? lot.slice(0, idx) : lot;
}

function stripVialTag(compound: string | null): string {
  return (compound ?? "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

export type CoaVial = {
  sampleId: string;
  batchId: string;
  compound: string | null;
  lot: string | null;
  appearance: string | null;
  test: { id: string; method_name: string; instrument: string } | null;
  result: {
    purity_percentage: number | null;
    analysis_date: string;
    peak_details: Peak[];
    uv_conf_match: number | null;
    wavelength_nm: number | null;
    chromatogram_image: string | null;
    calibration_image: string | null;
    calibration_data: Json | null;
    analyst_id: string | null;
    reviewer_id: string | null;
    approved_at: string | null;
  } | null;
  targetPeak: Peak | null;
};

export type CoaNonchromSummary = {
  testType: "sterility" | "endotoxin";
  data: Json | null;
  analysisDate: string | null;
};

export type CoaData = {
  primary: {
    batch_id: string; client: string; project: string | null; receipt_date: string;
    compound: string; physical_form: string | null;
  };
  vials: CoaVial[];
  sterility: CoaNonchromSummary | null;
  endotoxin: CoaNonchromSummary | null;
  vialPhoto: string | null;
  analystName: string | null;
  reviewerName: string | null;
  endotoxinAssaySensitivity: number | null;
};

export const getCoaData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sampleId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<CoaData> => {
    const { supabase } = context;
    const { data: sample, error } = await supabase.from("samples").select("*").eq("id", data.sampleId).maybeSingle();
    if (error) throw error;
    if (!sample) throw new Error("Sample not found");

    const base = lotBase(sample.lot);
    const untaggedCompound = stripVialTag(sample.compound);

    const { data: cocSiblings } = sample.coc_id
      ? await supabase.from("samples").select("*").eq("coc_id", sample.coc_id)
      : { data: [sample] };
    const siblings = cocSiblings ?? [sample];

    type SampleRow = (typeof siblings)[number];

    let finalMainVials: SampleRow[];
    let sterilitySample: SampleRow | undefined;
    let endotoxinSample: SampleRow | undefined;

    if (sample.lot_id) {
      // Three-level intake: the lot is an explicit column, so grouping is a
      // lookup rather than the string heuristics below. Purity vials are
      // the report's rows; the non-chrom vials supply the summary boxes.
      const lotVials = siblings
        .filter((s) => s.lot_id === sample.lot_id)
        .sort((a, b) => (a.vial_no ?? 0) - (b.vial_no ?? 0));
      const purity = lotVials.filter((s) => s.assigned_test_type === "purity");
      finalMainVials = purity.length ? purity : [sample];
      sterilitySample = lotVials.find((s) => s.assigned_test_type === "sterility");
      endotoxinSample = lotVials.find((s) => s.assigned_test_type === "endotoxin");
    } else {
      // Legacy flat intake (pre-hierarchy rows, never migrated): fall back
      // to matching on the customer lot's base prefix and the compound name
      // with its "[... vial]" tag stripped.
      const sameGroup = (s: SampleRow) => base != null && lotBase(s.lot) === base;
      const isAddOnVial = (s: SampleRow) => /\[[^\]]*vial\]\s*$/i.test(s.compound ?? "");
      const mainVials = siblings
        .filter((s) => sameGroup(s) && stripVialTag(s.compound) === untaggedCompound && !isAddOnVial(s))
        .sort((a, b) => (a.coc_line_no ?? 0) - (b.coc_line_no ?? 0));
      finalMainVials = mainVials.length ? mainVials : [sample];
      const addOnFor = (tag: RegExp) =>
        siblings.find((s) => sameGroup(s) && stripVialTag(s.compound) === untaggedCompound && tag.test(s.compound ?? ""));
      sterilitySample = addOnFor(/\[Sterility/i);
      endotoxinSample = addOnFor(/\[Endotoxin/i);
    }

    const { data: cfgRow } = await supabase.from("export_config")
      .select("include_lcs, include_ccv, include_method_blank, include_calibration").limit(1).maybeSingle();
    const exportCfg = cfgRow ?? { include_lcs: false, include_ccv: false, include_method_blank: false, include_calibration: true };

    const vialPayloads = await Promise.all(
      finalMainVials.map((s) => buildPartnerExportPayload(supabase, s, exportCfg)),
    );

    const vials: CoaVial[] = finalMainVials.map((s, i) => {
      const purityTest = vialPayloads[i].tests.find((t) => t.test_type === "purity");
      const r = purityTest?.results[0] as Record<string, unknown> | undefined;
      const peaks = (r?.peak_details as unknown as Peak[]) ?? [];
      const target = peaks.find((p) => !isUnassignedPeak(p.identity)) ?? null;
      return {
        sampleId: s.id, batchId: s.batch_id, compound: s.compound, lot: s.lot,
        appearance: (r?.appearance as string | null) ?? null,
        test: purityTest ? { id: purityTest.id, method_name: purityTest.method_name, instrument: purityTest.instrument } : null,
        result: r ? {
          purity_percentage: r.purity_percentage as number | null,
          analysis_date: r.analysis_date as string,
          peak_details: peaks,
          uv_conf_match: r.uv_conf_match as number | null,
          wavelength_nm: r.wavelength_nm as number | null,
          chromatogram_image: r.chromatogram_png as string | null,
          calibration_image: r.calibration_png as string | null,
          calibration_data: (r.calibration_data ?? null) as Json | null,
          analyst_id: r.analyst_id as string | null,
          reviewer_id: r.reviewer_id as string | null,
          approved_at: r.approved_at as string | null,
        } : null,
        targetPeak: target ?? null,
      };
    });

    /** Prefers the dedicated add-on vial; falls back to a matching test on the primary main vial for products never split off into their own add-on vial. */
    async function nonchromSummary(addOnSample: SampleRow | undefined, testType: "sterility" | "endotoxin"): Promise<CoaNonchromSummary | null> {
      const payload = addOnSample
        ? await buildPartnerExportPayload(supabase, addOnSample, exportCfg)
        : vialPayloads[0];
      if (!payload) return null;
      const test = payload.tests.find((t) => t.test_type === testType);
      const r = test?.results[0] as { data?: Json; analysis_date?: string } | undefined;
      if (!r) return null;
      return { testType, data: (r.data ?? null) as Json | null, analysisDate: r.analysis_date ?? null };
    }

    const [sterility, endotoxin] = await Promise.all([
      nonchromSummary(sterilitySample, "sterility"),
      nonchromSummary(endotoxinSample, "endotoxin"),
    ]);

    let analystName: string | null = null;
    let reviewerName: string | null = null;
    for (const payload of vialPayloads) {
      const r = payload.tests.find((t) => t.test_type === "purity")?.results[0] as
        { analyst_name?: string | null; reviewer_name?: string | null } | undefined;
      if (!analystName && r?.analyst_name) analystName = r.analyst_name;
      if (!reviewerName && r?.reviewer_name) reviewerName = r.reviewer_name;
    }

    const endotoxinAssaySensitivity =
      (endotoxin?.data as { assay_sensitivity_eu_per_ml?: number } | null)?.assay_sensitivity_eu_per_ml ?? null;

    return {
      primary: {
        batch_id: sample.batch_id, client: sample.client, project: sample.project,
        receipt_date: sample.receipt_date, compound: untaggedCompound, physical_form: sample.physical_form,
      },
      vials,
      sterility, endotoxin,
      vialPhoto: vialPayloads[0]?.vial_photo ?? null,
      analystName, reviewerName,
      endotoxinAssaySensitivity,
    };
  });

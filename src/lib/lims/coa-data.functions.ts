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
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findVialPhotoDataUri } from "@/lib/lims/coc/vial-photo-drive-sync.functions";
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
  test: { id: string; method_name: string; instrument: string; spec_min: number | null; spec_max: number | null } | null;
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
    const sameGroup = (s: SampleRow) => base != null && lotBase(s.lot) === base;
    const isAddOnVial = (s: SampleRow) => /\[[^\]]*vial\]\s*$/i.test(s.compound ?? "");

    const mainVials = siblings
      .filter((s) => sameGroup(s) && stripVialTag(s.compound) === untaggedCompound && !isAddOnVial(s))
      .sort((a, b) => (a.coc_line_no ?? 0) - (b.coc_line_no ?? 0));
    const finalMainVials = mainVials.length ? mainVials : [sample];

    const addOnFor = (tag: RegExp) =>
      siblings.find((s) => sameGroup(s) && stripVialTag(s.compound) === untaggedCompound && tag.test(s.compound ?? ""));
    const sterilitySample = addOnFor(/\[Sterility/i);
    const endotoxinSample = addOnFor(/\[Endotoxin/i);

    const vialSampleIds = finalMainVials.map((s) => s.id);
    const { data: vialTests } = vialSampleIds.length
      ? await supabase.from("tests").select("*").in("sample_id", vialSampleIds).eq("test_type", "purity")
      : { data: [] };
    const testIds = (vialTests ?? []).map((t) => t.id);
    const { data: vialResults } = testIds.length
      ? await supabase.from("results").select("*").in("test_id", testIds)
      : { data: [] };

    const testBySample = new Map((vialTests ?? []).map((t) => [t.sample_id, t]));
    const resultByTest = new Map((vialResults ?? []).map((r) => [r.test_id, r]));

    const vials: CoaVial[] = finalMainVials.map((s) => {
      const test = testBySample.get(s.id) ?? null;
      const result = test ? (resultByTest.get(test.id) ?? null) : null;
      const peaks = (result?.peak_details as unknown as Peak[]) ?? [];
      const target = peaks.find((p) => !isUnassignedPeak(p.identity)) ?? null;
      return {
        sampleId: s.id, batchId: s.batch_id, compound: s.compound, lot: s.lot,
        appearance: s.physical_description,
        test: test ? { id: test.id, method_name: test.method_name, instrument: test.instrument, spec_min: test.spec_min, spec_max: test.spec_max } : null,
        result: result ? {
          purity_percentage: result.purity_percentage, analysis_date: result.analysis_date,
          peak_details: peaks, uv_conf_match: result.uv_conf_match, wavelength_nm: result.wavelength_nm,
          chromatogram_image: result.chromatogram_image, calibration_image: result.calibration_image,
          calibration_data: result.calibration_data, analyst_id: result.analyst_id, reviewer_id: result.reviewer_id,
          approved_at: result.approved_at,
        } : null,
        targetPeak: target ?? null,
      };
    });

    /** Prefers the dedicated add-on vial; falls back to a matching test on one of the main vials themselves for products never split off into their own add-on vial. */
    async function nonchromSummary(addOnSample: SampleRow | undefined, testType: "sterility" | "endotoxin"): Promise<CoaNonchromSummary | null> {
      const targetSampleIds = addOnSample ? [addOnSample.id] : vialSampleIds;
      if (!targetSampleIds.length) return null;
      const { data: matchingTests } = await supabase.from("tests").select("id").eq("test_type", testType).in("sample_id", targetSampleIds).limit(1);
      const testId = matchingTests?.[0]?.id;
      if (!testId) return null;
      const { data: nr } = await supabase.from("nonchrom_results").select("data, analysis_date")
        .eq("test_id", testId).order("analysis_date", { ascending: false }).limit(1).maybeSingle();
      if (!nr) return null;
      return { testType, data: nr.data, analysisDate: nr.analysis_date };
    }

    const [sterility, endotoxin] = await Promise.all([
      nonchromSummary(sterilitySample, "sterility"),
      nonchromSummary(endotoxinSample, "endotoxin"),
    ]);

    const vialPhoto = await findVialPhotoDataUri(supabase, sample.batch_id);

    const analystId = vials.find((v) => v.result?.analyst_id)?.result?.analyst_id ?? null;
    const reviewerId = vials.find((v) => v.result?.reviewer_id)?.result?.reviewer_id ?? null;
    const profileIds = [analystId, reviewerId].filter((x): x is string => !!x);
    const { data: profiles } = profileIds.length
      ? await supabase.from("profiles").select("id, full_name, first_name, last_name, email").in("id", profileIds)
      : { data: [] };
    const nameFor = (id: string | null) => {
      if (!id) return null;
      const p = (profiles ?? []).find((p) => p.id === id);
      if (!p) return null;
      const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      return fl || p.full_name || p.email || null;
    };

    const { data: settings } = await supabase.from("sp_settings")
      .select("endotoxin_assay_sensitivity_eu_per_ml").eq("id", true).maybeSingle();

    return {
      primary: {
        batch_id: sample.batch_id, client: sample.client, project: sample.project,
        receipt_date: sample.receipt_date, compound: untaggedCompound, physical_form: sample.physical_form,
      },
      vials,
      sterility, endotoxin,
      vialPhoto,
      analystName: nameFor(analystId),
      reviewerName: nameFor(reviewerId),
      endotoxinAssaySensitivity: settings?.endotoxin_assay_sensitivity_eu_per_ml ?? null,
    };
  });

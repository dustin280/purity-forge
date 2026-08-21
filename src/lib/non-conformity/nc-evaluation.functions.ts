/**
 * Run, save, and list Non-Conformity Identifier evaluations. Reads
 * peaks/sample/result data passed in from the client (already loaded by
 * the Results tab) — never queries results/tests/samples for write
 * purposes, and writes only to the nc_evaluations/nc_evaluation_findings
 * tables, which are outside the compliance review/approve trail.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  rankCandidatesForPeak,
  generateNextSteps,
  LOW_AREA_PCT_THRESHOLD,
  type PeakInput,
  type NcCandidateInput,
  type RankedCandidate,
} from "./engine";
import type { AnySupabase } from "./supabase-any";

/** Row shape for tables not yet in the generated Supabase types (see supabase-any.ts). */
type NcRow = Record<string, AnySupabase>;

const peakInput = z.object({
  peak_id: z.string(),
  rt: z.number(),
  area_pct: z.number(),
  peak_purity: z.number().nullable().optional(),
  peak_purity_passed: z.boolean().nullable().optional(),
  uv_match: z.number().nullable().optional(),
  identity: z.string().nullable().optional(),
});

const previewInput = z.object({
  sample_id: z.string().uuid(),
  result_id: z.string().uuid().nullable(),
  nc_compound_id: z.string().uuid(),
  peaks: z.array(peakInput).min(1),
  stress_context: z.string().max(1000).nullable().optional(),
});

interface FindingPreview {
  peak_id: string;
  rt: number;
  area_pct: number;
  peak_purity: number | null;
  peak_purity_passed: boolean | null;
  uv_match: number | null;
  ranked: RankedCandidate[];
  next_steps: { text: string; sourceRuleId?: string }[];
}

export const previewNcEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewInput.parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as AnySupabase;
    const [
      { data: compound, error: e1 },
      { data: impurities, error: e2 },
      { data: oligomers, error: e3 },
      { data: panel, error: e4 },
    ] = await Promise.all([
      supabase
        .from("nc_compounds")
        .select("id, name, monoisotopic_mass")
        .eq("id", data.nc_compound_id)
        .single(),
      supabase.from("nc_impurity_candidates").select("*").eq("nc_compound_id", data.nc_compound_id),
      supabase.from("nc_oligomer_candidates").select("*").eq("nc_compound_id", data.nc_compound_id),
      supabase
        .from("nc_spectral_panels")
        .select("wavelengths_nm, recommended_features")
        .eq("nc_compound_id", data.nc_compound_id)
        .maybeSingle(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;

    const candidates: NcCandidateInput[] = [
      ...(impurities ?? []).map(
        (r: NcRow): NcCandidateInput => ({
          id: r.id,
          kind: "impurity",
          name: r.name,
          evidenceLevel: r.evidence_level,
          rpHplcBehavior: r.rp_hplc_behavior,
          massDelta: r.mass_delta,
          likelyTrigger: r.likely_trigger,
        }),
      ),
      ...(oligomers ?? []).map(
        (r: NcRow): NcCandidateInput => ({
          id: r.id,
          kind: "oligomer",
          name: r.name,
          evidenceLevel: r.evidence_level,
          rpHplcBehavior: r.rp_hplc_behavior,
          massDelta: r.mass_delta_vs_n_monomer,
          likelyTrigger: r.trigger_motif,
          falsePositiveWarning: r.false_positive_warning,
        }),
      ),
    ];

    const parentPeak = data.peaks.reduce(
      (a, b) => (b.area_pct > a.area_pct ? b : a),
      data.peaks[0],
    );
    const extraPeaks = data.peaks.filter(
      (p) => p.peak_id !== parentPeak.peak_id && p.area_pct >= LOW_AREA_PCT_THRESHOLD,
    );

    const findings: FindingPreview[] = extraPeaks.map((p) => {
      const peak: PeakInput = {
        peakId: p.peak_id,
        rt: p.rt,
        areaPct: p.area_pct,
        peakPurity: p.peak_purity ?? null,
        peakPurityPassed: p.peak_purity_passed ?? null,
        uvMatch: p.uv_match ?? null,
      };
      const ranked = rankCandidatesForPeak({
        peak,
        parentPeakRt: parentPeak.rt,
        parentMonoisotopicMass: compound.monoisotopic_mass,
        candidates,
        stressContext: data.stress_context ?? null,
      });
      const nextSteps = generateNextSteps({
        topCandidates: ranked.slice(0, 3),
        spectralPanel: panel
          ? {
              wavelengthsNm: panel.wavelengths_nm ?? [],
              recommendedFeatures: panel.recommended_features,
            }
          : null,
        hasObservedMass: false,
      });
      return {
        peak_id: p.peak_id,
        rt: p.rt,
        area_pct: p.area_pct,
        peak_purity: p.peak_purity ?? null,
        peak_purity_passed: p.peak_purity_passed ?? null,
        uv_match: p.uv_match ?? null,
        ranked,
        next_steps: nextSteps,
      };
    });

    return {
      compound_name: compound.name as string,
      parent_peak_id: parentPeak.peak_id,
      spectral_panel: panel ?? null,
      findings,
    };
  });

const saveFindingInput = z.object({
  peak_id: z.string(),
  rt: z.number(),
  area_pct: z.number(),
  peak_purity: z.number().nullable(),
  peak_purity_passed: z.boolean().nullable(),
  uv_match: z.number().nullable(),
  candidate_kind: z.enum(["impurity", "oligomer"]).nullable(),
  matched_candidate_id: z.string().uuid().nullable(),
  component_scores: z.record(z.string(), z.number()),
  tier: z.enum(["unflagged", "candidate", "probable_class", "probable_identity"]),
  rationale: z.string().max(4000).nullable().optional(),
  analyst_note: z.string().max(2000).nullable().optional(),
});

const saveEvaluationInput = z.object({
  sample_id: z.string().uuid(),
  result_id: z.string().uuid().nullable(),
  nc_compound_id: z.string().uuid(),
  run_by_name: z.string().min(1).max(255),
  stress_context: z.string().max(1000).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  overall_tier: z.enum(["clear", "candidate", "probable_class", "probable_identity"]),
  findings: z.array(saveFindingInput),
  // Raw .dx file this evaluation was linked to (see dx-link.functions.ts) —
  // record-keeping only this pass; not yet consumed by scoring.
  dx_file_id: z.string().nullable().optional(),
  dx_folder_id: z.string().nullable().optional(),
  dx_match_confidence: z.enum(["auto", "manual", "none"]).nullable().optional(),
});

export const saveNcEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveEvaluationInput.parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as AnySupabase;
    const { data: evalRow, error: e1 } = await supabase
      .from("nc_evaluations")
      .insert({
        sample_id: data.sample_id,
        result_id: data.result_id,
        nc_compound_id: data.nc_compound_id,
        run_by: context.userId,
        run_by_name: data.run_by_name,
        stress_context: data.stress_context ?? null,
        summary: data.summary ?? null,
        overall_tier: data.overall_tier,
        dx_file_id: data.dx_file_id ?? null,
        dx_folder_id: data.dx_folder_id ?? null,
        dx_match_confidence: data.dx_match_confidence ?? null,
      })
      .select("id")
      .single();
    if (e1) throw e1;

    if (data.findings.length) {
      const rows = data.findings.map((f) => ({
        evaluation_id: evalRow.id,
        peak_id: f.peak_id,
        rt: f.rt,
        area_pct: f.area_pct,
        peak_purity: f.peak_purity,
        peak_purity_passed: f.peak_purity_passed,
        uv_match: f.uv_match,
        candidate_kind: f.candidate_kind,
        matched_candidate_id: f.matched_candidate_id,
        component_scores: f.component_scores,
        tier: f.tier,
        rationale: f.rationale ?? null,
        analyst_note: f.analyst_note ?? null,
      }));
      const { error: e2 } = await supabase.from("nc_evaluation_findings").insert(rows);
      if (e2) throw e2;
    }
    return { id: evalRow.id as string };
  });

export const listNcEvaluationsForSample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sampleId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await (context.supabase as AnySupabase)
      .from("nc_evaluations")
      .select("id, run_by_name, run_at, overall_tier, summary, nc_compound:nc_compounds(name)")
      .eq("sample_id", data.sampleId)
      .order("run_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      run_by_name: string;
      run_at: string;
      overall_tier: string;
      summary: string | null;
      nc_compound: { name: string } | null;
    }>;
  });

export const getNcEvaluationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as AnySupabase;
    const { data: evaluation, error: e1 } = await supabase
      .from("nc_evaluations")
      .select("*, nc_compound:nc_compounds(id, name, class, molecular_formula)")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    const { data: findings, error: e2 } = await supabase
      .from("nc_evaluation_findings")
      .select("*")
      .eq("evaluation_id", data.id)
      .order("created_at", { ascending: true });
    if (e2) throw e2;

    // Read-only display context — sample batch_id for the header/link and
    // the source result's chromatogram image, if still available. Never
    // written back to.
    const [{ data: sample }, { data: result }] = await Promise.all([
      evaluation.sample_id
        ? supabase
            .from("samples")
            .select("batch_id, client")
            .eq("id", evaluation.sample_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      evaluation.result_id
        ? supabase
            .from("results")
            .select("chromatogram_image")
            .eq("id", evaluation.result_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const impurityIds = (findings ?? [])
      .filter((f: NcRow) => f.candidate_kind === "impurity" && f.matched_candidate_id)
      .map((f: NcRow) => f.matched_candidate_id);
    const oligomerIds = (findings ?? [])
      .filter((f: NcRow) => f.candidate_kind === "oligomer" && f.matched_candidate_id)
      .map((f: NcRow) => f.matched_candidate_id);
    const [{ data: impurities }, { data: oligomers }] = await Promise.all([
      impurityIds.length
        ? supabase.from("nc_impurity_candidates").select("*").in("id", impurityIds)
        : Promise.resolve({ data: [] }),
      oligomerIds.length
        ? supabase.from("nc_oligomer_candidates").select("*").in("id", oligomerIds)
        : Promise.resolve({ data: [] }),
    ]);
    const candidateById = new Map<string, NcRow>([
      ...(impurities ?? []).map(
        (c: NcRow) => [c.id, { ...c, kind: "impurity" }] as [string, NcRow],
      ),
      ...(oligomers ?? []).map((c: NcRow) => [c.id, { ...c, kind: "oligomer" }] as [string, NcRow]),
    ]);

    return {
      evaluation,
      findings: (findings ?? []).map((f: NcRow) => ({
        ...f,
        candidate: f.matched_candidate_id
          ? (candidateById.get(f.matched_candidate_id) ?? null)
          : null,
      })),
      sample: sample ?? null,
      chromatogram_image: (result?.chromatogram_image as string | null) ?? null,
    };
  });

/**
 * Bench Reference cut sheet -- Step D of the Sample Prep redesign (see memory
 * purity-forge-sample-prep-workflow-plan / -target-design). Reads the plans
 * generate-from-queue.functions.ts already computed and persisted (one
 * sp_preparation_records + sp_preparation_steps row per sample) and turns
 * them into the printable label+recipe+record document. "Proceed to Run
 * List" self-stamps each record approved -- Mandatory Review (Step F) isn't
 * built yet, but Dustin's already-confirmed default for it is "off" (a
 * single analyst has zero friction until reviews are actually needed), so
 * this is that default behavior, not new compliance surface.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface CutSheetStep {
  ordinal: number;
  instruction: string;
  label: string;
}

export interface CutSheetComponent {
  name: string;
  targetConcMgPerMl: number;
  resultingConcMgPerMl: number;
  /**
   * Which calibration level the shared dilution was aimed at. A blend can't
   * hit every component's mid-curve at once, so the sheet has to say what it
   * was aiming for -- otherwise "Target 0.255" reads as the compound's L3
   * when it is really its L1.
   */
  calibrationLevel?: number | null;
  /**
   * true / false / null, where **null means no calibration range was known
   * for this compound, so nothing was checked**. Rendering null as "yes"
   * would vouch for the one component nobody verified.
   */
  withinRange?: boolean | null;
  /**
   * Whether this component sits inside the L3 spectral window. Null when no
   * L3 is on file. Separate from withinRange on purpose: range is about
   * QUANTITATION, this is about whether UV confirmation against the L3
   * reference spectrum is valid at this signal level.
   */
  withinSpectralWindow?: boolean | null;
}

export interface CutSheetSample {
  prepId: string;
  prepNumber: string;
  batchId: string;
  compound: string | null;
  resolvedCompound: string | null;
  isBlend: boolean;
  components: CutSheetComponent[];
  targetConcentrationMgPerMl: number | null;
  calibrationLevel: number | null;
  totalDilutionFactor: number | null;
  warnings: string[];
  steps: CutSheetStep[];
}

export const getCutSheetData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prep_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: SB }).supabase;
    const [{ data: records, error: recErr }, { data: steps, error: stepErr }] = await Promise.all([
      supabase.from("sp_preparation_records")
        .select("id, prep_number, sample_id, sample_context, plan, planned_target_concentration_mg_per_ml, planned_calibration_level, total_dilution_factor")
        .in("id", data.prep_ids),
      supabase.from("sp_preparation_steps")
        .select("record_id, step_no, planned")
        .in("record_id", data.prep_ids)
        .order("step_no"),
    ]);
    if (recErr) throw recErr;
    if (stepErr) throw stepErr;

    const stepsByRecord = new Map<string, CutSheetStep[]>();
    for (const s of (steps ?? []) as Array<{ record_id: string; step_no: number; planned: { instruction?: string; label?: string } }>) {
      const list = stepsByRecord.get(s.record_id) ?? [];
      list.push({ ordinal: s.step_no, instruction: s.planned?.instruction ?? "", label: s.planned?.label ?? "" });
      stepsByRecord.set(s.record_id, list);
    }

    const samples: CutSheetSample[] = ((records ?? []) as Array<{
      id: string; prep_number: string; sample_id: string | null;
      sample_context: { compound?: string; resolved_compound?: string } | null;
      plan: { isBlend?: boolean; warnings?: (string | { message: string })[]; components?: CutSheetComponent[] } | null;
      planned_target_concentration_mg_per_ml: number | null;
      planned_calibration_level: number | null;
      total_dilution_factor: number | null;
    }>).map((r) => {
      const plan = r.plan ?? {};
      const rawWarnings = plan.warnings ?? [];
      return {
        prepId: r.id,
        prepNumber: r.prep_number,
        batchId: r.sample_id ?? "—",
        compound: r.sample_context?.compound ?? null,
        resolvedCompound: r.sample_context?.resolved_compound ?? null,
        isBlend: !!plan.isBlend,
        components: plan.components ?? [],
        targetConcentrationMgPerMl: r.planned_target_concentration_mg_per_ml,
        calibrationLevel: r.planned_calibration_level,
        totalDilutionFactor: r.total_dilution_factor,
        warnings: rawWarnings.map(w => (typeof w === "string" ? w : w.message)),
        steps: (stepsByRecord.get(r.id) ?? []).sort((a, b) => a.ordinal - b.ordinal),
      };
    });
    // Preserve the order the caller asked for (queue display order) rather
    // than whatever order the `in()` query happened to return.
    const byId = new Map(samples.map(s => [s.prepId, s] as const));
    return { samples: data.prep_ids.map(id => byId.get(id)).filter((s): s is CutSheetSample => !!s) };
  });

export const approveSamplePrepRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prep_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("sp_preparation_records")
      .update({
        status: "approved",
        prepared_at: now,
        submitted_at: now,
        reviewed_by: userId,
        reviewed_at: now,
      })
      .in("id", data.prep_ids)
      .eq("status", "draft");
    if (error) throw error;
    return { ok: true, count: data.prep_ids.length };
  });

/**
 * Sample -> preparation plan generation, driven directly from a set of
 * sample IDs (Analysis Queue "Send to Prep" hand-off) rather than from an
 * existing run list. Reuses every piece of generate-from-run-list.functions.ts
 * unmodified (compound resolution, plan-input building, planPreparation(),
 * persistence) -- the only real difference is there's no run_list_items row
 * to read/write here, since no run list exists yet at this point in the
 * pipeline. A later run list generated from these samples picks the
 * resulting sp_preparation_records back up via sample_context.sample_id,
 * same as the run-list-first path already does.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planPreparation } from "./prep-engine";
import {
  type SampleCtx, type GeneratedRow, type NeedsInputRow,
  resolutionKeyFor, resolveCompoundContexts, buildPlanInput, persistPlan,
  loadGlobalPrepSettings, loadLabAssets,
} from "./generate-from-run-list.functions";

export type { GeneratedRow, NeedsInputRow } from "./generate-from-run-list.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function loadSamples(supabase: SB, sampleIds: string[]): Promise<Map<string, SampleCtx>> {
  const { data: rows } = await supabase
    .from("samples")
    .select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent")
    .in("id", sampleIds);
  return new Map(((rows ?? []) as SampleCtx[]).map((s) => [s.id, s] as const));
}

export const generateSamplePrepForSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sample_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const samples = await loadSamples(context.supabase, data.sample_ids);
    const created: GeneratedRow[] = [];
    const needsInput: NeedsInputRow[] = [];

    const settings = await loadGlobalPrepSettings(context.supabase);
    const [{ byCompoundLower }, assets] = await Promise.all([
      resolveCompoundContexts(context.supabase, Array.from(samples.values()), settings),
      loadLabAssets(context.supabase),
    ]);

    for (const sampleId of data.sample_ids) {
      const sample = samples.get(sampleId);
      if (!sample) continue;
      const resolutionKey = resolutionKeyFor(sample);
      if (!resolutionKey) {
        needsInput.push({ run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: "no_compound", message: "Sample has no compound recorded." });
        continue;
      }
      const resolved = byCompoundLower.get(resolutionKey);
      if (!resolved || "reason" in resolved) {
        needsInput.push({ run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: resolved?.reason ?? "no_calibration_data", message: resolved?.message ?? "Could not resolve a calibration target." });
        continue;
      }
      const built = buildPlanInput(sample, resolved, undefined, assets);
      if (!built.ok) {
        needsInput.push({ run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: built.reason, message: built.message });
        continue;
      }
      const plan = planPreparation(built.input);
      if (!plan.ok) {
        needsInput.push({ run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: "plan_error", message: plan.error ?? "Could not compute a plan." });
        continue;
      }
      const { prep_id, prep_number } = await persistPlan(context.supabase, context.userId, sample, resolved, plan, "queue");
      created.push({
        run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
        warnings: plan.warnings.map((w) => w.message), steps: plan.steps.map((s) => s.instruction),
        targetConcentrationMgPerMl: plan.targetConcentrationMgPerMl, calibrationLevel: resolved.calibrationLevel,
        totalDilutionFactor: plan.totalDilutionFactor, stockConcentrationMgPerMl: plan.stockConcentrationMgPerMl,
      });
    }

    return { created, needsInput };
  });

export const recomputeSamplePrepForSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sample_id: z.string().uuid(),
    overrides: z.object({
      received_form: z.enum(["lyophilized", "solution"]).optional(),
      received_quantity: z.number().optional(),
      received_quantity_unit: z.string().optional(),
      received_purity_percent: z.number().optional(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sampleRow, error: sErr } = await context.supabase
      .from("samples").select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent")
      .eq("id", data.sample_id).single();
    if (sErr) throw sErr;
    const sample = sampleRow as SampleCtx;
    const resolutionKey = resolutionKeyFor(sample);
    if (!resolutionKey) throw new Error("Sample has no compound recorded.");

    const settings = await loadGlobalPrepSettings(context.supabase);
    const [{ byCompoundLower }, assets] = await Promise.all([
      resolveCompoundContexts(context.supabase, [sample], settings),
      loadLabAssets(context.supabase),
    ]);
    const resolved = byCompoundLower.get(resolutionKey);
    if (!resolved || "reason" in resolved) throw new Error(resolved?.message ?? "Could not resolve a calibration target.");

    const built = buildPlanInput(sample, resolved, data.overrides, assets);
    if (!built.ok) throw new Error(built.message);
    const plan = planPreparation(built.input);
    if (!plan.ok) throw new Error(plan.error ?? "Could not compute a plan.");

    const { prep_id, prep_number } = await persistPlan(context.supabase, context.userId, sample, resolved, plan, "queue");
    return {
      run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
      warnings: plan.warnings.map((w) => w.message), steps: plan.steps.map((s) => s.instruction),
      targetConcentrationMgPerMl: plan.targetConcentrationMgPerMl, calibrationLevel: resolved.calibrationLevel,
      totalDilutionFactor: plan.totalDilutionFactor, stockConcentrationMgPerMl: plan.stockConcentrationMgPerMl,
    } satisfies GeneratedRow;
  });

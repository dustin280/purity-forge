/**
 * Sample -> preparation plan generation, driven directly from a set of
 * sample IDs (Analysis Queue "Send to Prep" hand-off) rather than from an
 * existing run list. Reuses every piece of generate-from-run-list.functions.ts
 * unmodified (compound resolution, blend detection, plan-input building,
 * planPreparation()/planBlendPreparation(), persistence) -- the only real
 * difference is there's no run_list_items row to read/write here, since no
 * run list exists yet at this point in the pipeline. A later run list
 * generated from these samples picks the resulting sp_preparation_records
 * back up via sample_context.sample_id, same as the run-list-first path
 * already does.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type SampleCtx, type GeneratedRow, type NeedsInputRow,
  resolutionKeyFor, resolveCompoundContexts, loadGlobalPrepSettings, loadLabAssets,
  planAndPersistForSample,
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
      const result = await planAndPersistForSample(context.supabase, context.userId, sample, resolved, assets, undefined, "queue");
      if (!result.ok) {
        needsInput.push({ run_list_item_id: sample.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: result.reason, message: result.message });
        continue;
      }
      created.push({ run_list_item_id: sample.id, ...result.row });
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

    const result = await planAndPersistForSample(context.supabase, context.userId, sample, resolved, assets, data.overrides, "queue");
    if (!result.ok) throw new Error(result.message);
    return { run_list_item_id: sample.id, ...result.row } satisfies GeneratedRow;
  });

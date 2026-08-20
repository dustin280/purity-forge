/**
 * Run list -> per-sample preparation plan generation.
 *
 * Replaces the old generatePrepDraftsForRunList (one empty-plan record per
 * unique compound) with one fully-computed sp_preparation_records row per
 * physical sample: resolves compound -> linked sp_analyte -> approved
 * method revision -> calibration range + prep rules, pulls the sample's
 * as-received data, and calls the existing planPreparation() engine
 * (src/lib/sample-prep/prep-engine.ts) unmodified. Rows that can't be
 * planned (missing link, missing as-received data, no default diluent,
 * etc.) are reported as needs-input instead of failing the whole batch —
 * recomputeSamplePrepForItem lets the review screen fill gaps and retry
 * one row at a time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planPreparation, type PrepPlanInput, type PrepPlan } from "./prep-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export type NeedsInputReason =
  | "no_compound"
  | "no_analyte_link"
  | "no_active_method"
  | "no_approved_revision"
  | "no_calibration_level"
  | "no_diluent"
  | "missing_as_received_data"
  | "plan_error";

export interface GeneratedRow {
  run_list_item_id: string;
  sample_id: string;
  batch_id: string | null;
  compound: string | null;
  prep_id: string;
  prep_number: string;
  warnings: string[];
  steps: string[];
  targetConcentrationMgPerMl: number;
  calibrationLevel: number | null;
}

export interface NeedsInputRow {
  run_list_item_id: string;
  sample_id: string;
  batch_id: string | null;
  compound: string | null;
  reason: NeedsInputReason;
  message: string;
}

interface SampleCtx {
  id: string;
  batch_id: string | null;
  compound: string | null;
  compound_id: string | null;
  concentration: string | null;
  received_form: "lyophilized" | "solution" | null;
  received_quantity: number | null;
  received_quantity_unit: string | null;
  received_purity_percent: number | null;
}

/**
 * Resolution key for a sample's compound: prefer the real compound_id FK
 * (set by the intake picker) over a case-insensitive name match, which
 * only exists now as a fallback for rows that predate the picker.
 */
function resolutionKeyFor(sample: Pick<SampleCtx, "compound_id" | "compound">): string | null {
  if (sample.compound_id) return `id:${sample.compound_id}`;
  const name = (sample.compound ?? "").trim();
  return name ? `name:${name.toLowerCase()}` : null;
}

/** Mirrors dilution.ts's own unit tables — kept local since those aren't exported. */
const MASS_TO_MG: Record<string, number> = { g: 1000, mg: 1, ug: 0.001, µg: 0.001 };
const VOL_TO_UL: Record<string, number> = { ml: 1000, mL: 1000, ul: 1, uL: 1, µl: 1, µL: 1 };

/** Mirrors new.tsx's local normalizeToMgPerMl — small enough to duplicate rather than touch that route. */
function normalizeToMgPerMl(value: number | null | undefined, unit: string | null | undefined): number | null {
  if (value == null) return null;
  const u = (unit ?? "mg/mL").toLowerCase().replace(/\s+/g, "");
  switch (u) {
    case "mg/ml": return value;
    case "µg/ml":
    case "ug/ml": return value / 1000;
    case "ng/ml": return value / 1_000_000;
    case "g/l": return value;
    case "mg/l": return value / 1000;
    default: return value;
  }
}

/** Mirrors optimizer.ts's private parseConcentrationMgPerMl — kept local since that one isn't exported. */
function parseConcentrationMgPerMl(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = String(v).trim().match(/([-+]?\d*\.?\d+)\s*([a-zµμ%/]*)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (/^(µg|ug|mcg)\/?(ml)?$/.test(unit)) return n / 1000;
  if (/^ng\/?(ml)?$/.test(unit)) return n / 1_000_000;
  if (/^g\/?(ml|l)?$/.test(unit)) return unit.includes("l") && !unit.includes("ml") ? n / 1000 : n * 1000;
  return n;
}

interface ResolvedRevisionCtx {
  analyteId: string;
  analyteName: string;
  revisionId: string;
  ruleId: string | null;
  rules: {
    absoluteMinPipetteUl: number;
    preferredMinPipetteUl: number;
    maxPipetteUl: number | null;
    maxDilutionSteps: number;
    preferredFinalVolumeUl: number | null;
    minInitialReconstitutionUl: number | null;
    maxInitialReconstitutionUl: number | null;
    preferredInitialReconstitutionUl: number | null;
    defaultTargetLevel: number;
  };
  diluentName: string | null;
  targetConcMgPerMl: number | null;
  calibrationLevel: number | null;
  calMinMgPerMl: number | null;
  calMaxMgPerMl: number | null;
}

/** Resolves compound -> sp_analyte -> approved revision -> calibration + prep rules + diluent for every unique compound on the run list, in one batch. */
async function resolveRevisionContexts(supabase: SB, samples: SampleCtx[]): Promise<{
  byCompoundLower: Map<string, ResolvedRevisionCtx | { reason: NeedsInputReason; message: string }>;
}> {
  const byCompoundLower = new Map<string, ResolvedRevisionCtx | { reason: NeedsInputReason; message: string }>();

  // One "unit" per unique resolution key needed (id-based when the intake
  // picker set compound_id, name-based as a fallback for older rows).
  const units = new Map<string, string>(); // key -> display label
  for (const s of samples) {
    const key = resolutionKeyFor(s);
    if (!key) continue;
    if (!units.has(key)) units.set(key, (s.compound ?? "").trim() || key);
  }
  if (!units.size) return { byCompoundLower };

  const compoundIds = Array.from(units.keys()).filter(k => k.startsWith("id:")).map(k => k.slice(3));
  const compoundNames = Array.from(units.keys()).filter(k => k.startsWith("name:")).map(k => units.get(k) as string);

  type CompoundRow = { id: string; name: string; sp_analyte_id: string | null };
  const [{ data: byIdRows }, { data: byNameRows }] = await Promise.all([
    compoundIds.length
      ? supabase.from("compounds").select("id, name, sp_analyte_id").in("id", compoundIds)
      : Promise.resolve({ data: [] }),
    compoundNames.length
      ? supabase.from("compounds").select("id, name, sp_analyte_id").in("name", compoundNames)
      : Promise.resolve({ data: [] }),
  ]);
  const analyteIdByKey = new Map<string, string | null>();
  for (const c of (byIdRows ?? []) as CompoundRow[]) analyteIdByKey.set(`id:${c.id}`, c.sp_analyte_id);
  for (const c of (byNameRows ?? []) as CompoundRow[]) analyteIdByKey.set(`name:${c.name.trim().toLowerCase()}`, c.sp_analyte_id);

  const analyteIds = Array.from(new Set(Array.from(analyteIdByKey.values()).filter(Boolean))) as string[];
  const { data: analyteRows } = analyteIds.length
    ? await supabase.from("sp_analytes").select("id, canonical_name").in("id", analyteIds)
    : { data: [] };
  const analyteNameById = new Map(
    ((analyteRows ?? []) as Array<{ id: string; canonical_name: string }>).map(a => [a.id, a.canonical_name] as const),
  );

  const { data: methodRows } = analyteIds.length
    ? await supabase.from("sp_methods").select("id, analyte_id").in("analyte_id", analyteIds).eq("is_active", true)
    : { data: [] };
  const methods = (methodRows ?? []) as Array<{ id: string; analyte_id: string }>;
  const methodToAnalyte = new Map(methods.map(m => [m.id, m.analyte_id] as const));
  const methodIds = methods.map(m => m.id);

  const { data: revRows } = methodIds.length
    ? await supabase.from("sp_method_revisions").select("id, method_id, revision")
      .in("method_id", methodIds).eq("status", "approved").order("revision", { ascending: false })
    : { data: [] };
  const revisionByAnalyte = new Map<string, string>();
  for (const r of (revRows ?? []) as Array<{ id: string; method_id: string }>) {
    const analyte = methodToAnalyte.get(r.method_id);
    if (analyte && !revisionByAnalyte.has(analyte)) revisionByAnalyte.set(analyte, r.id);
  }

  const revisionIds = Array.from(new Set(Array.from(revisionByAnalyte.values())));
  const [{ data: levelRows }, { data: ruleRows }] = await Promise.all([
    revisionIds.length
      ? supabase.from("sp_method_calibration_levels").select("*").in("revision_id", revisionIds)
      : Promise.resolve({ data: [] }),
    revisionIds.length
      ? supabase.from("sp_method_prep_rules").select("*").in("revision_id", revisionIds)
      : Promise.resolve({ data: [] }),
  ]);
  const levelsByRevision = new Map<string, Array<{ level_number: number; target_concentration: number | null; concentration_unit: string | null; is_active: boolean; include_in_calibration: boolean }>>();
  for (const l of (levelRows ?? []) as Array<{ revision_id: string; level_number: number; target_concentration: number | null; concentration_unit: string | null; is_active: boolean; include_in_calibration: boolean }>) {
    const arr = levelsByRevision.get(l.revision_id) ?? [];
    arr.push(l);
    levelsByRevision.set(l.revision_id, arr);
  }
  type RuleRow = {
    revision_id: string; default_target_level: number; default_sample_solvent_id: string | null;
    min_pipette_volume_ul: number | null; preferred_min_pipette_volume_ul: number | null; max_pipette_volume_ul: number | null;
    max_dilution_steps: number | null; preferred_final_volume_ul: number | null;
    min_initial_reconstitution_volume_ul: number | null; max_initial_reconstitution_volume_ul: number | null;
    preferred_initial_reconstitution_volume_ul: number | null; id: string;
  };
  const rulesByRevision = new Map(((ruleRows ?? []) as RuleRow[]).map(r => [r.revision_id, r] as const));

  const solventIds = Array.from(new Set(((ruleRows ?? []) as RuleRow[]).map(r => r.default_sample_solvent_id).filter(Boolean))) as string[];
  const { data: solventRows } = solventIds.length
    ? await supabase.from("sp_solvent_formulations").select("id, name").in("id", solventIds)
    : { data: [] };
  const solventNameById = new Map(((solventRows ?? []) as Array<{ id: string; name: string }>).map(s => [s.id, s.name] as const));

  for (const [key, compound] of units) {
    const analyteId = analyteIdByKey.get(key);
    if (!analyteId) { byCompoundLower.set(key, { reason: "no_analyte_link", message: `"${compound}" isn't linked to a Sample Prep analyte (Admin → Compounds).` }); continue; }
    const revisionId = revisionByAnalyte.get(analyteId);
    if (!revisionId) {
      const hasMethod = methods.some(m => m.analyte_id === analyteId);
      byCompoundLower.set(key, hasMethod
        ? { reason: "no_approved_revision", message: `No approved method revision for ${analyteNameById.get(analyteId) ?? compound}.` }
        : { reason: "no_active_method", message: `No active method for ${analyteNameById.get(analyteId) ?? compound}.` });
      continue;
    }
    const rule = rulesByRevision.get(revisionId);
    if (!rule) { byCompoundLower.set(key, { reason: "no_calibration_level", message: `Method revision has no prep rules configured.` }); continue; }
    const levels = (levelsByRevision.get(revisionId) ?? []).filter(l => l.is_active !== false && l.include_in_calibration !== false && l.target_concentration != null);
    if (!levels.length) { byCompoundLower.set(key, { reason: "no_calibration_level", message: `Method revision has no active calibration levels.` }); continue; }
    const calMgPerMl = levels.map(l => normalizeToMgPerMl(l.target_concentration, l.concentration_unit)).filter((n): n is number => n != null);
    const targetLevel = levels.find(l => l.level_number === rule.default_target_level) ?? levels[Math.floor(levels.length / 2)];
    const diluentName = rule.default_sample_solvent_id ? solventNameById.get(rule.default_sample_solvent_id) ?? null : null;
    if (!diluentName) { byCompoundLower.set(key, { reason: "no_diluent", message: `No default diluent set on the method's Prep Rules tab.` }); continue; }

    byCompoundLower.set(key, {
      analyteId, analyteName: analyteNameById.get(analyteId) ?? compound, revisionId, ruleId: rule.id,
      rules: {
        absoluteMinPipetteUl: rule.min_pipette_volume_ul ?? 10,
        preferredMinPipetteUl: rule.preferred_min_pipette_volume_ul ?? 20,
        maxPipetteUl: rule.max_pipette_volume_ul,
        maxDilutionSteps: rule.max_dilution_steps ?? 5,
        preferredFinalVolumeUl: rule.preferred_final_volume_ul,
        minInitialReconstitutionUl: rule.min_initial_reconstitution_volume_ul,
        maxInitialReconstitutionUl: rule.max_initial_reconstitution_volume_ul,
        preferredInitialReconstitutionUl: rule.preferred_initial_reconstitution_volume_ul,
        defaultTargetLevel: rule.default_target_level,
      },
      diluentName,
      targetConcMgPerMl: normalizeToMgPerMl(targetLevel.target_concentration, targetLevel.concentration_unit),
      calibrationLevel: targetLevel.level_number,
      calMinMgPerMl: calMgPerMl.length ? Math.min(...calMgPerMl) : null,
      calMaxMgPerMl: calMgPerMl.length ? Math.max(...calMgPerMl) : null,
    });
  }
  return { byCompoundLower };
}

interface Overrides {
  received_form?: "lyophilized" | "solution";
  received_quantity?: number;
  received_quantity_unit?: string;
  received_purity_percent?: number;
}

interface LabAssets {
  vessels: PrepPlanInput["vessels"];
  equipment: PrepPlanInput["equipment"];
}

async function loadLabAssets(supabase: SB): Promise<LabAssets> {
  const [{ data: vesselRows }, { data: equipRows }] = await Promise.all([
    supabase.from("sp_vessels").select("id, name, nominal_capacity_ul, min_working_volume_ul, max_working_volume_ul").eq("is_active", true),
    supabase.from("sp_equipment").select("id, equipment_id, equipment_type, manufacturer, model, min_capacity, max_capacity, capacity_unit").eq("is_active", true),
  ]);
  return {
    vessels: ((vesselRows ?? []) as Array<{ id: string; name: string; nominal_capacity_ul: number; min_working_volume_ul: number | null; max_working_volume_ul: number | null }>).map(v => ({
      id: v.id, name: v.name, nominalCapacityUl: v.nominal_capacity_ul, minWorkingUl: v.min_working_volume_ul, maxWorkingUl: v.max_working_volume_ul,
    })),
    equipment: ((equipRows ?? []) as Array<{ id: string; equipment_id: string | null; equipment_type: string; manufacturer: string | null; model: string | null; min_capacity: number | null; max_capacity: number | null; capacity_unit: string | null }>).map(e => ({
      id: e.id, label: [e.manufacturer, e.model, e.equipment_id].filter(Boolean).join(" ") || e.equipment_type,
      equipmentType: e.equipment_type, minCapacity: e.min_capacity, maxCapacity: e.max_capacity, capacityUnit: e.capacity_unit,
    })),
  };
}

/** Builds a PrepPlanInput for one sample given its resolved revision context, applying any analyst-supplied overrides for missing as-received data. Returns a needs-input result instead of throwing when required data is absent. */
function buildPlanInput(
  sample: SampleCtx,
  ctx: ResolvedRevisionCtx,
  overrides: Overrides | undefined,
  assets: LabAssets,
): { ok: true; input: PrepPlanInput } | { ok: false; reason: NeedsInputReason; message: string } {
  const form = overrides?.received_form ?? sample.received_form;
  if (!form) return { ok: false, reason: "missing_as_received_data", message: "Physical form (solid/solution) not recorded — provide it to compute a plan." };

  const qty = overrides?.received_quantity ?? sample.received_quantity;
  const qtyUnit = (overrides?.received_quantity_unit ?? sample.received_quantity_unit ?? "").toLowerCase();
  const purityPct = overrides?.received_purity_percent ?? sample.received_purity_percent;

  if (ctx.targetConcMgPerMl == null || !ctx.rules.preferredFinalVolumeUl) {
    return { ok: false, reason: "no_calibration_level", message: "Target concentration or preferred final volume is not configured." };
  }

  const source: PrepPlanInput["source"] = form === "lyophilized"
    ? {
      form: "lyophilized",
      availableMassMg: qty != null ? qty * (MASS_TO_MG[qtyUnit] ?? 1) : null,
      purityFraction: purityPct != null ? purityPct / 100 : 1,
    }
    : {
      form: "solution",
      stockConcentrationMgPerMl: parseConcentrationMgPerMl(sample.concentration),
      availableVolumeUl: qty != null ? qty * (VOL_TO_UL[qtyUnit] ?? 1) : null,
    };

  if (form === "lyophilized" && !source.availableMassMg) {
    return { ok: false, reason: "missing_as_received_data", message: "As-received mass is missing." };
  }
  if (form === "solution" && (!source.stockConcentrationMgPerMl || !source.availableVolumeUl)) {
    return { ok: false, reason: "missing_as_received_data", message: "As-received concentration or volume is missing/unparseable." };
  }

  return {
    ok: true,
    input: {
      analyteName: ctx.analyteName,
      source,
      reconstitution: {
        volumeUl: ctx.rules.preferredInitialReconstitutionUl,
        solventName: ctx.diluentName as string,
      },
      target: {
        concentrationMgPerMl: ctx.targetConcMgPerMl,
        finalVolumeUl: ctx.rules.preferredFinalVolumeUl as number,
        calibrationLevel: ctx.calibrationLevel,
      },
      rules: {
        absoluteMinPipetteUl: ctx.rules.absoluteMinPipetteUl,
        preferredMinPipetteUl: ctx.rules.preferredMinPipetteUl,
        maxPipetteUl: ctx.rules.maxPipetteUl,
        maxDilutionSteps: ctx.rules.maxDilutionSteps,
        preferredFinalVolumeUl: ctx.rules.preferredFinalVolumeUl,
        minInitialReconstitutionUl: ctx.rules.minInitialReconstitutionUl,
        maxInitialReconstitutionUl: ctx.rules.maxInitialReconstitutionUl,
        preferredInitialReconstitutionUl: ctx.rules.preferredInitialReconstitutionUl,
      },
      calibration: { minMgPerMl: ctx.calMinMgPerMl, maxMgPerMl: ctx.calMaxMgPerMl },
      vessels: assets.vessels,
      equipment: assets.equipment,
    },
  };
}

async function persistPlan(
  supabase: SB, userId: string, sample: SampleCtx, ctx: ResolvedRevisionCtx, plan: PrepPlan,
): Promise<{ prep_id: string; prep_number: string }> {
  const { data: prepNumberData, error: numErr } = await supabase.rpc("next_sp_prep_number");
  if (numErr) throw numErr;
  const prep_number = prepNumberData as string;

  const { data: record, error } = await supabase
    .from("sp_preparation_records")
    .insert({
      prep_number,
      method_revision_id: ctx.revisionId,
      analyte_id: ctx.analyteId,
      status: "draft",
      planned_target_concentration_mg_per_ml: plan.targetConcentrationMgPerMl,
      planned_target_volume_ul: plan.finalVolumeUl,
      planned_calibration_level: ctx.calibrationLevel,
      sample_id: sample.batch_id,
      sample_context: { source: "run_list", sample_id: sample.id, compound: sample.compound },
      plan: { warnings: plan.warnings, totalDilutionFactor: plan.totalDilutionFactor, stockConcentrationMgPerMl: plan.stockConcentrationMgPerMl },
      total_dilution_factor: plan.totalDilutionFactor,
      prepared_by: userId,
    })
    .select("id, prep_number")
    .single();
  if (error) throw error;

  if (plan.steps.length) {
    const { error: sErr } = await supabase.from("sp_preparation_steps").insert(
      plan.steps.map(s => ({
        record_id: record.id,
        step_no: s.ordinal,
        kind: s.kind,
        planned: {
          instruction: s.instruction, label: s.toLabel,
          suggested_vessel_id: s.suggestedVesselId ?? null,
          suggested_equipment_id: s.suggestedEquipmentId ?? null,
        },
      })),
    );
    if (sErr) throw sErr;
  }
  return { prep_id: record.id as string, prep_number: record.prep_number as string };
}

async function loadUnlinkedSampleRows(supabase: SB, runListId: string): Promise<{
  items: Array<{ id: string; sample_id: string }>;
  samples: Map<string, SampleCtx>;
  skipped: NeedsInputRow[];
}> {
  const { data: items, error } = await supabase
    .from("run_list_items")
    .select("id, sample_id, sp_preparation_record_id")
    .eq("run_list_id", runListId)
    .order("row_no");
  if (error) throw error;
  const rows = (items ?? []) as Array<{ id: string; sample_id: string | null; sp_preparation_record_id: string | null }>;
  const unlinked = rows.filter(r => r.sample_id && !r.sp_preparation_record_id);
  const sampleIds = Array.from(new Set(unlinked.map(r => r.sample_id))) as string[];
  const { data: sampleRows } = sampleIds.length
    ? await supabase.from("samples").select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent").in("id", sampleIds)
    : { data: [] };
  const samples = new Map(((sampleRows ?? []) as SampleCtx[]).map(s => [s.id, s] as const));
  return {
    items: unlinked.map(r => ({ id: r.id, sample_id: r.sample_id as string })),
    samples,
    skipped: [],
  };
}

export const generateSamplePrepForRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_list_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { items, samples } = await loadUnlinkedSampleRows(context.supabase, data.run_list_id);
    const created: GeneratedRow[] = [];
    const needsInput: NeedsInputRow[] = [];

    const [{ byCompoundLower }, assets] = await Promise.all([
      resolveRevisionContexts(context.supabase, Array.from(samples.values())),
      loadLabAssets(context.supabase),
    ]);

    for (const item of items) {
      const sample = samples.get(item.sample_id);
      if (!sample) continue;
      const resolutionKey = resolutionKeyFor(sample);
      if (!resolutionKey) {
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: "no_compound", message: "Sample has no compound recorded." });
        continue;
      }
      const resolved = byCompoundLower.get(resolutionKey);
      if (!resolved || "reason" in resolved) {
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: resolved?.reason ?? "no_analyte_link", message: resolved?.message ?? "Could not resolve method." });
        continue;
      }
      const built = buildPlanInput(sample, resolved, undefined, assets);
      if (!built.ok) {
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: built.reason, message: built.message });
        continue;
      }
      const plan = planPreparation(built.input);
      if (!plan.ok) {
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: "plan_error", message: plan.error ?? "Could not compute a plan." });
        continue;
      }
      const { prep_id, prep_number } = await persistPlan(context.supabase, context.userId, sample, resolved, plan);
      await context.supabase.from("run_list_items").update({ sp_preparation_record_id: prep_id }).eq("id", item.id);
      created.push({
        run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
        warnings: plan.warnings.map(w => w.message), steps: plan.steps.map(s => s.instruction),
        targetConcentrationMgPerMl: plan.targetConcentrationMgPerMl, calibrationLevel: resolved.calibrationLevel,
      });
    }

    return { created, needsInput };
  });

export const recomputeSamplePrepForItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    run_list_item_id: z.string().uuid(),
    overrides: z.object({
      received_form: z.enum(["lyophilized", "solution"]).optional(),
      received_quantity: z.number().optional(),
      received_quantity_unit: z.string().optional(),
      received_purity_percent: z.number().optional(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item, error: itemErr } = await context.supabase
      .from("run_list_items").select("id, sample_id").eq("id", data.run_list_item_id).single();
    if (itemErr) throw itemErr;
    if (!item.sample_id) throw new Error("Row has no sample.");

    const { data: sampleRow, error: sErr } = await context.supabase
      .from("samples").select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent")
      .eq("id", item.sample_id).single();
    if (sErr) throw sErr;
    const sample = sampleRow as SampleCtx;
    const resolutionKey = resolutionKeyFor(sample);
    if (!resolutionKey) throw new Error("Sample has no compound recorded.");

    const [{ byCompoundLower }, assets] = await Promise.all([
      resolveRevisionContexts(context.supabase, [sample]),
      loadLabAssets(context.supabase),
    ]);
    const resolved = byCompoundLower.get(resolutionKey);
    if (!resolved || "reason" in resolved) throw new Error(resolved?.message ?? "Could not resolve method.");

    const built = buildPlanInput(sample, resolved, data.overrides, assets);
    if (!built.ok) throw new Error(built.message);
    const plan = planPreparation(built.input);
    if (!plan.ok) throw new Error(plan.error ?? "Could not compute a plan.");

    const { prep_id, prep_number } = await persistPlan(context.supabase, context.userId, sample, resolved, plan);
    await context.supabase.from("run_list_items").update({ sp_preparation_record_id: prep_id }).eq("id", item.id);
    return {
      run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
      warnings: plan.warnings.map(w => w.message), steps: plan.steps.map(s => s.instruction),
      targetConcentrationMgPerMl: plan.targetConcentrationMgPerMl, calibrationLevel: resolved.calibrationLevel,
    } satisfies GeneratedRow;
  });

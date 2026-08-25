/**
 * Run list -> per-sample preparation plan generation.
 *
 * One fully-computed sp_preparation_records row per physical sample:
 * resolves the sample's raw compound text against the `compounds`
 * registry (fuzzy, same matcher cal-qc-matching.ts uses), pulls that
 * compound's real 6-point calibration set (or the sp_settings global
 * fallback range for anything not yet calibrated), pulls the sample's
 * as-received data, and calls the existing planPreparation() engine
 * (src/lib/sample-prep/prep-engine.ts) unmodified. Deliberately does NOT
 * go through sp_analytes/sp_methods/sp_method_revisions -- that approval
 * chain governs acquisition methods, which is a separate concern from
 * dilution instructions and was never actually populated (see the
 * 2026-08-24 migration). Rows that can't be planned (missing as-received
 * data, no calibration data anywhere, etc.) are reported as needs-input
 * instead of failing the whole batch -- recomputeSamplePrepForItem lets
 * the review screen fill gaps and retry one row at a time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planPreparation, planBlendPreparation, type PrepPlanInput, type PrepPlan, type BlendPlanInput, type BlendPlan, type BlendComponentResult } from "./prep-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export type NeedsInputReason =
  | "no_compound"
  | "no_calibration_data"
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
  // For a single-compound row these describe the one compound. For a
  // blend row (components is non-empty) they mirror the first component
  // as a display fallback -- render sub-rows from `components` instead.
  targetConcentrationMgPerMl: number;
  calibrationLevel: number | null;
  totalDilutionFactor: number | null;
  stockConcentrationMgPerMl: number | null;
  components?: BlendComponentResult[];
}

export interface NeedsInputRow {
  run_list_item_id: string;
  sample_id: string;
  batch_id: string | null;
  compound: string | null;
  reason: NeedsInputReason;
  message: string;
}

export interface SampleCtx {
  id: string;
  batch_id: string | null;
  compound: string | null;
  compound_id: string | null;
  concentration: string | null;
  received_form: "lyophilized" | "solution" | null;
  received_quantity: number | null;
  received_quantity_unit: string | null;
  received_purity_percent: number | null;
  container_size: string | null;
}

/**
 * Resolution key for a sample's compound: prefer the real compound_id FK
 * (set by the intake picker) over a case-insensitive name match, which
 * only exists now as a fallback for rows that predate the picker.
 */
export function resolutionKeyFor(sample: Pick<SampleCtx, "compound_id" | "compound">): string | null {
  if (sample.compound_id) return `id:${sample.compound_id}`;
  const name = (sample.compound ?? "").trim();
  return name ? `name:${name.toLowerCase()}` : null;
}

/** Mirrors dilution.ts's own unit tables — kept local since those aren't exported. */
const MASS_TO_MG: Record<string, number> = { g: 1000, mg: 1, ug: 0.001, µg: 0.001 };
const VOL_TO_UL: Record<string, number> = { ml: 1000, mL: 1000, ul: 1, uL: 1, µl: 1, µL: 1 };

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

// "Cartalax 20mg + TB-500 10mg + BPC-157 10mg + KPV 10mg" -> per-component
// mass. This is the SUMMIT-style layout where the intake text already
// spells out each component's own mg -- not the harder "named blend,
// aggregate-only" case (e.g. a hypothetical "KLOW 80mg" with no per-
// compound breakdown at all), which has no lookup table today and is left
// as a needs-input gap rather than guessed at.
export function parseBlendMassBreakdown(compoundText: string): Array<{ name: string; massMg: number }> | null {
  const cleaned = compoundText.replace(/\s*\[[^\]]*\]\s*$/, "");
  // Everything after the blend label's opening "(" -- tolerates a missing
  // closing ")", confirmed present in real intake data (SYX-000006-10's
  // compound text has an unbalanced paren). A strict "(...)" match would
  // silently swallow the whole string into one unparseable segment and
  // drop every component instead of just failing loudly.
  const openIdx = cleaned.indexOf("(");
  const body = (openIdx >= 0 ? cleaned.slice(openIdx + 1) : cleaned).replace(/\)\s*$/, "");
  const parts = body.split("+").map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const items: Array<{ name: string; massMg: number }> = [];
  for (const part of parts) {
    const m = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g)\s*$/i);
    if (!m) return null; // any segment that doesn't parse invalidates the whole breakdown
    const [, rawName, amountStr, unit] = m;
    const amount = parseFloat(amountStr);
    const massMg = amount * (MASS_TO_MG[unit.toLowerCase()] ?? 1);
    const name = rawName.trim();
    if (!name || !Number.isFinite(massMg) || massMg <= 0) return null;
    items.push({ name, massMg });
  }
  return items;
}

export interface ResolvedBlendComponentCtx {
  name: string;
  compoundId: string | null;
  targetConcMgPerMl: number;
  calibrationLevel: number | null;
  calMinMgPerMl: number | null;
  calMaxMgPerMl: number | null;
}

export interface ResolvedBlendCtx {
  kind: "blend";
  blendName: string;
  diluentName: string;
  rules: ResolvedRevisionCtx["rules"];
  components: ResolvedBlendComponentCtx[];
}

export interface ResolvedRevisionCtx {
  kind: "single";
  analyteName: string;
  rules: {
    absoluteMinPipetteUl: number;
    preferredMinPipetteUl: number;
    maxDilutionSteps: number;
    preferredFinalVolumeUl: number;
    preferredInitialReconstitutionUl: number;
  };
  diluentName: string;
  targetConcMgPerMl: number;
  calibrationLevel: number | null;
  calMinMgPerMl: number | null;
  calMaxMgPerMl: number | null;
}

interface GlobalPrepSettings {
  absoluteMinPipetteUl: number;
  preferredMinPipetteUl: number;
  maxDilutionSteps: number;
  finalVolumeUl: number;
  reconstitutionVolumeUl: number;
  diluentName: string;
  defaultCalMinMgPerMl: number;
  defaultCalMaxMgPerMl: number;
  defaultTargetLevel: number;
}

export async function loadGlobalPrepSettings(supabase: SB): Promise<GlobalPrepSettings> {
  const { data } = await supabase.from("sp_settings").select("*").eq("id", true).maybeSingle();
  const s = (data ?? {}) as Record<string, unknown>;
  return {
    absoluteMinPipetteUl: Number(s.absolute_min_pipette_ul ?? 10),
    preferredMinPipetteUl: Number(s.preferred_min_pipette_ul ?? 20),
    maxDilutionSteps: Number(s.max_dilution_steps ?? 5),
    finalVolumeUl: Number(s.default_final_volume_ul ?? 1000),
    reconstitutionVolumeUl: Number(s.default_reconstitution_volume_ul ?? 1000),
    diluentName: (s.default_diluent_name as string | null) ?? "Mobile Phase A",
    defaultCalMinMgPerMl: Number(s.default_cal_min_mg_per_ml ?? 0.1),
    defaultCalMaxMgPerMl: Number(s.default_cal_max_mg_per_ml ?? 0.2),
    defaultTargetLevel: Number(s.default_target_level ?? 3),
  };
}

/**
 * Resolves each unique compound on the run list against the `compounds`
 * registry (exact case-insensitive match, then a substring-either-direction
 * fuzzy fallback -- same tiering as matchCompound() in
 * lab-logs/cal-qc-matching.ts, inlined here since we already have the full
 * compounds list loaded and matching against it in-memory avoids an N+1
 * query per unique compound). A registry match is optional, purely for
 * picking up a calibration override -- everything falls back to the
 * sp_settings global default, so no compound is ever gated on being linked
 * to anything.
 */
export async function resolveCompoundContexts(supabase: SB, samples: SampleCtx[], settings: GlobalPrepSettings): Promise<{
  byCompoundLower: Map<string, ResolvedRevisionCtx | ResolvedBlendCtx | { reason: NeedsInputReason; message: string }>;
}> {
  const byCompoundLower = new Map<string, ResolvedRevisionCtx | ResolvedBlendCtx | { reason: NeedsInputReason; message: string }>();

  const units = new Map<string, string>(); // key -> display label
  for (const s of samples) {
    const key = resolutionKeyFor(s);
    if (!key) continue;
    if (!units.has(key)) units.set(key, (s.compound ?? "").trim() || key);
  }
  if (!units.size) return { byCompoundLower };

  const { data: compoundRows } = await supabase
    .from("compounds")
    .select("id, name, is_blend, cal_l1_mg_per_ml, cal_l2_mg_per_ml, cal_l3_mg_per_ml, cal_l4_mg_per_ml, cal_l5_mg_per_ml, cal_l6_mg_per_ml, default_diluent_name");
  type CompoundRow = {
    id: string; name: string; is_blend: boolean; default_diluent_name: string | null;
    cal_l1_mg_per_ml: number | null; cal_l2_mg_per_ml: number | null; cal_l3_mg_per_ml: number | null;
    cal_l4_mg_per_ml: number | null; cal_l5_mg_per_ml: number | null; cal_l6_mg_per_ml: number | null;
  };
  const compounds = (compoundRows ?? []) as CompoundRow[];
  const byId = new Map(compounds.map(c => [c.id, c] as const));

  type BlendComponentRow = {
    blend_id: string; component_id: string;
    cal_l1_mg_per_ml: number | null; cal_l2_mg_per_ml: number | null; cal_l3_mg_per_ml: number | null;
    cal_l4_mg_per_ml: number | null; cal_l5_mg_per_ml: number | null; cal_l6_mg_per_ml: number | null;
  };
  const blendIds = compounds.filter(c => c.is_blend).map(c => c.id);
  const blendComponentsByBlendId = new Map<string, BlendComponentRow[]>();
  if (blendIds.length > 0) {
    const { data: bcRows } = await supabase
      .from("compound_blend_components")
      .select("blend_id, component_id, cal_l1_mg_per_ml, cal_l2_mg_per_ml, cal_l3_mg_per_ml, cal_l4_mg_per_ml, cal_l5_mg_per_ml, cal_l6_mg_per_ml")
      .in("blend_id", blendIds);
    for (const row of (bcRows ?? []) as BlendComponentRow[]) {
      const list = blendComponentsByBlendId.get(row.blend_id) ?? [];
      list.push(row);
      blendComponentsByBlendId.set(row.blend_id, list);
    }
  }

  function resolveBlend(match: CompoundRow): ResolvedBlendCtx {
    const rows = blendComponentsByBlendId.get(match.id) ?? [];
    const components: ResolvedBlendComponentCtx[] = rows.map(row => {
      const comp = byId.get(row.component_id);
      const levels = [row.cal_l1_mg_per_ml, row.cal_l2_mg_per_ml, row.cal_l3_mg_per_ml, row.cal_l4_mg_per_ml, row.cal_l5_mg_per_ml, row.cal_l6_mg_per_ml];
      const numericLevels = levels.map((v, i) => ({ level: i + 1, v })).filter((l): l is { level: number; v: number } => l.v != null);
      const target = numericLevels.find(l => l.level === settings.defaultTargetLevel) ?? numericLevels[Math.floor(numericLevels.length / 2)] ?? null;
      const calVals = numericLevels.map(l => l.v);
      return {
        name: comp?.name ?? row.component_id,
        compoundId: row.component_id,
        targetConcMgPerMl: target?.v ?? (settings.defaultCalMinMgPerMl + settings.defaultCalMaxMgPerMl) / 2,
        calibrationLevel: target?.level ?? null,
        calMinMgPerMl: calVals.length ? Math.min(...calVals) : settings.defaultCalMinMgPerMl,
        calMaxMgPerMl: calVals.length ? Math.max(...calVals) : settings.defaultCalMaxMgPerMl,
      };
    });
    return {
      kind: "blend",
      // Some blend registry rows have their full recipe baked into `name`
      // (e.g. "SUMMIT (Cartalax 20mg + ...)") rather than just "SUMMIT" --
      // use the short form for display so the generated instruction text
      // doesn't double-list every component's mg alongside the real one
      // parsed from the sample's own text.
      blendName: match.name.split("(")[0].trim() || match.name,
      diluentName: match.default_diluent_name ?? settings.diluentName,
      rules: {
        absoluteMinPipetteUl: settings.absoluteMinPipetteUl,
        preferredMinPipetteUl: settings.preferredMinPipetteUl,
        maxDilutionSteps: settings.maxDilutionSteps,
        preferredFinalVolumeUl: settings.finalVolumeUl,
        preferredInitialReconstitutionUl: settings.reconstitutionVolumeUl,
      },
      components,
    };
  }

  // Strip a "[... vial]" tag (see the non-chrom exclusion rule) and a
  // trailing dose like " 50mg" — samples record compound as free text
  // ("BPC-157 50mg"), not the clean registry name, and neither salt-form
  // variant in the registry ("BPC-157 Acetate", "BPC-157 (free)") is a
  // clean substring/superset match against just "BPC-157" alone.
  const cleanForMatch = (name: string): string =>
    name.replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s+\d+(\.\d+)?\s*(mg|mcg|µg|ug|g)\s*$/i, "").trim();

  // Bare compound names that are genuinely ambiguous between multiple
  // registry variants (different salt forms, different calibration
  // ranges) -- confirmed defaults, not a guess. Extend as new ambiguities
  // turn up rather than letting length/substring heuristics pick one.
  const BARE_NAME_DEFAULT: Record<string, string> = {
    "bpc-157": "BPC-157 Acetate",
  };

  const findByName = (rawName: string): CompoundRow | null => {
    const lower = cleanForMatch(rawName).toLowerCase();
    if (!lower) return null;
    const exact = compounds.find(c => c.name.trim().toLowerCase() === lower);
    if (exact) return exact;
    const aliased = BARE_NAME_DEFAULT[lower];
    if (aliased) {
      const found = compounds.find(c => c.name === aliased);
      if (found) return found;
    }
    // A blend name (e.g. "SUMMIT (Cartalax + ... + BPC-157 + KPV)") lists
    // its own component compounds inside its name -- letting a short query
    // like "BPC-157" match it just because the blend's name *contains*
    // "BPC-157" would swallow every single-compound sample that happens to
    // share an ingredient with any blend. Blends may only match when the
    // sample's own text fully contains the blend's name, never the reverse.
    const candidates = compounds.filter(c => {
      const n = c.name.trim().toLowerCase();
      if (lower.includes(n)) return true;
      const isBlend = n.includes(" + ");
      return !isBlend && n.includes(lower) && n.length <= lower.length + 20;
    });
    if (!candidates.length) return null;
    // Multiple rows can substring-match the same raw name (e.g. a blend
    // like "SUMMIT (...KPV 10mg)" also contains "KPV" itself). Longest
    // name wins first -- that's the more specific/complete match, and
    // picking the short one just because it happens to have calibration
    // data would silently mis-resolve a blend to one of its components.
    // Calibration-data presence only breaks a genuine tie in specificity.
    candidates.sort((a, b) => b.name.length - a.name.length || (b.cal_l1_mg_per_ml != null ? 1 : 0) - (a.cal_l1_mg_per_ml != null ? 1 : 0));
    return candidates[0];
  };

  for (const [key, label] of units) {
    const match = key.startsWith("id:") ? byId.get(key.slice(3)) ?? null : findByName(label);

    if (match?.is_blend) {
      byCompoundLower.set(key, resolveBlend(match));
      continue;
    }

    const levels = match
      ? [match.cal_l1_mg_per_ml, match.cal_l2_mg_per_ml, match.cal_l3_mg_per_ml, match.cal_l4_mg_per_ml, match.cal_l5_mg_per_ml, match.cal_l6_mg_per_ml]
      : [];
    const numericLevels = levels.map((v, i) => ({ level: i + 1, v })).filter((l): l is { level: number; v: number } => l.v != null);

    const target = numericLevels.find(l => l.level === settings.defaultTargetLevel)
      ?? numericLevels[Math.floor(numericLevels.length / 2)]
      ?? null;
    const targetConcMgPerMl = target?.v ?? (settings.defaultCalMinMgPerMl + settings.defaultCalMaxMgPerMl) / 2;
    const calVals = numericLevels.map(l => l.v);
    const calMin = calVals.length ? Math.min(...calVals) : settings.defaultCalMinMgPerMl;
    const calMax = calVals.length ? Math.max(...calVals) : settings.defaultCalMaxMgPerMl;

    byCompoundLower.set(key, {
      kind: "single",
      analyteName: match?.name ?? label,
      rules: {
        absoluteMinPipetteUl: settings.absoluteMinPipetteUl,
        preferredMinPipetteUl: settings.preferredMinPipetteUl,
        maxDilutionSteps: settings.maxDilutionSteps,
        preferredFinalVolumeUl: settings.finalVolumeUl,
        preferredInitialReconstitutionUl: settings.reconstitutionVolumeUl,
      },
      diluentName: match?.default_diluent_name ?? settings.diluentName,
      targetConcMgPerMl,
      calibrationLevel: target?.level ?? null,
      calMinMgPerMl: calMin,
      calMaxMgPerMl: calMax,
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

export async function loadLabAssets(supabase: SB): Promise<LabAssets> {
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
export function buildPlanInput(
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
        solventName: ctx.diluentName,
      },
      target: {
        concentrationMgPerMl: ctx.targetConcMgPerMl,
        finalVolumeUl: ctx.rules.preferredFinalVolumeUl,
        calibrationLevel: ctx.calibrationLevel,
      },
      rules: {
        absoluteMinPipetteUl: ctx.rules.absoluteMinPipetteUl,
        preferredMinPipetteUl: ctx.rules.preferredMinPipetteUl,
        maxDilutionSteps: ctx.rules.maxDilutionSteps,
        preferredFinalVolumeUl: ctx.rules.preferredFinalVolumeUl,
        preferredInitialReconstitutionUl: ctx.rules.preferredInitialReconstitutionUl,
      },
      calibration: { minMgPerMl: ctx.calMinMgPerMl, maxMgPerMl: ctx.calMaxMgPerMl },
      vessels: assets.vessels,
      equipment: assets.equipment,
    },
  };
}

// Strips parenthetical qualifiers and every non-alphanumeric character so
// "TB500 (Thymosin β4 fragment)" and the sample text's own "TB-500 / TB-4"
// both reduce to a comparable core ("tb500..."/"tb500tb4") -- matched by
// prefix rather than requiring equality, confirmed against real SUMMIT
// sample text where the intake alias and registry name diverge like this.
function normalizeComponentName(s: string): string {
  return s.trim().toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
}

function componentNamesMatch(a: string, b: string): boolean {
  const na = normalizeComponentName(a);
  const nb = normalizeComponentName(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

/**
 * Builds a BlendPlanInput for a blend sample (SUMMIT etc.) -- parses the
 * sample's own compound text for the per-component mg breakdown (e.g.
 * "Cartalax 20mg + TB-500 10mg + ...") and matches each parsed name against
 * the blend's known components. A component that's in the blend's registry
 * but not found in the sample's text is dropped with a warning rather than
 * failing the whole plan -- e.g. a report that only lists 3 of 4 components
 * for some reason still gets a plan for the ones it can resolve.
 */
export function buildBlendPlanInput(
  sample: SampleCtx,
  ctx: ResolvedBlendCtx,
): { ok: true; input: BlendPlanInput; droppedComponents: string[] } | { ok: false; reason: NeedsInputReason; message: string } {
  const breakdown = sample.compound ? parseBlendMassBreakdown(sample.compound) : null;
  if (!breakdown) {
    return { ok: false, reason: "missing_as_received_data", message: `Could not parse a per-compound mg breakdown from "${sample.compound ?? ""}" — this blend has no named-recipe lookup, so the sample's own text must spell out each compound's mg.` };
  }
  const components: BlendPlanInput["components"] = [];
  const droppedComponents: string[] = [];
  for (const item of breakdown) {
    const known = ctx.components.find(c => componentNamesMatch(c.name, item.name));
    if (!known) { droppedComponents.push(item.name); continue; }
    components.push({
      name: known.name, massMg: item.massMg, targetConcMgPerMl: known.targetConcMgPerMl,
      calibrationLevel: known.calibrationLevel, calMinMgPerMl: known.calMinMgPerMl, calMaxMgPerMl: known.calMaxMgPerMl,
    });
  }
  if (components.length === 0) {
    return { ok: false, reason: "no_calibration_data", message: "None of this sample's parsed components matched the blend's known compounds." };
  }
  return {
    ok: true,
    droppedComponents,
    input: {
      analyteName: ctx.blendName,
      reconstitution: { volumeUl: ctx.rules.preferredInitialReconstitutionUl, solventName: ctx.diluentName },
      finalVolumeUl: ctx.rules.preferredFinalVolumeUl,
      components,
      rules: { absoluteMinPipetteUl: ctx.rules.absoluteMinPipetteUl, preferredMinPipetteUl: ctx.rules.preferredMinPipetteUl },
    },
  };
}

/**
 * A recompute (auto-run on every Prep Queue page load, or an explicit
 * "Recompute") should refine the one still-open plan for a sample, not
 * mint a new controlled document number every time -- prep_number comes
 * from register_document's real sequential counter (SYN-SAMP-######-MMDDYY,
 * the same controlled-numbering scheme used across the app), so repeatedly
 * inserting would both burn real document numbers on throwaway recomputes
 * and leave stale duplicate drafts in Records. Once a record leaves
 * "draft" (submitted/reviewed/approved) it's a real event and must not be
 * overwritten -- a recompute after that point starts a fresh draft.
 */
async function findOpenDraft(supabase: SB, sampleId: string, source: string): Promise<{ id: string; prep_number: string } | null> {
  // Filtered in application code, not via a `sample_context->>sample_id`
  // PostgREST filter -- see the identical caution in
  // run-lists/generate.functions.ts's resolvePrepsAndCoverage: the real
  // sample UUID only lives inside the jsonb blob, and no query in this
  // codebase trusts a JSON-path filter to round-trip through the client.
  const { data, error } = await supabase
    .from("sp_preparation_records")
    .select("id, prep_number, sample_context, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; prep_number: string; sample_context: { sample_id?: string; source?: string } | null }>;
  const match = rows.find(r => r.sample_context?.sample_id === sampleId && r.sample_context?.source === source);
  return match ? { id: match.id, prep_number: match.prep_number } : null;
}

export async function persistBlendPlan(
  supabase: SB, userId: string, sample: SampleCtx, ctx: ResolvedBlendCtx, plan: BlendPlan, source: string = "run_list",
): Promise<{ prep_id: string; prep_number: string }> {
  const existing = await findOpenDraft(supabase, sample.id, source);
  const recordId = existing?.id ?? crypto.randomUUID();
  let prep_number = existing?.prep_number;
  if (!prep_number) {
    const { data: docNumber, error: docErr } = await supabase
      .rpc("register_document", { p_code: "SAMP", p_source_table: "sp_preparation_records", p_source_id: recordId, p_created_by: userId });
    if (docErr) throw docErr;
    prep_number = docNumber as string;
  }

  const row = {
    id: recordId,
    prep_number,
    method_revision_id: null,
    analyte_id: null,
    status: "draft",
    // No single target concentration/level for a blend -- the real
    // per-compound breakdown lives in plan.components below.
    planned_target_concentration_mg_per_ml: null,
    planned_target_volume_ul: null,
    planned_calibration_level: null,
    sample_id: sample.batch_id,
    sample_context: { source, sample_id: sample.id, compound: sample.compound, resolved_compound: ctx.blendName },
    plan: {
      isBlend: true,
      warnings: plan.warnings,
      totalDilutionFactor: plan.totalDilutionFactor,
      components: plan.components,
    },
    total_dilution_factor: plan.totalDilutionFactor,
    prepared_by: userId,
  };
  const { data: record, error } = existing
    ? await supabase.from("sp_preparation_records").update(row).eq("id", recordId).select("id, prep_number").single()
    : await supabase.from("sp_preparation_records").insert(row).select("id, prep_number").single();
  if (error) throw error;

  if (existing) {
    const { error: delErr } = await supabase.from("sp_preparation_steps").delete().eq("record_id", recordId);
    if (delErr) throw delErr;
  }
  if (plan.steps.length) {
    const { error: sErr } = await supabase.from("sp_preparation_steps").insert(
      plan.steps.map(s => ({
        record_id: record.id,
        step_no: s.ordinal,
        kind: s.kind,
        planned: { instruction: s.instruction, label: s.toLabel },
      })),
    );
    if (sErr) throw sErr;
  }
  return { prep_id: record.id as string, prep_number: record.prep_number as string };
}

export async function persistPlan(
  supabase: SB, userId: string, sample: SampleCtx, ctx: ResolvedRevisionCtx, plan: PrepPlan, source: string = "run_list",
): Promise<{ prep_id: string; prep_number: string }> {
  const existing = await findOpenDraft(supabase, sample.id, source);
  const recordId = existing?.id ?? crypto.randomUUID();
  let prep_number = existing?.prep_number;
  if (!prep_number) {
    const { data: docNumber, error: docErr } = await supabase
      .rpc("register_document", { p_code: "SAMP", p_source_table: "sp_preparation_records", p_source_id: recordId, p_created_by: userId });
    if (docErr) throw docErr;
    prep_number = docNumber as string;
  }

  const row = {
    id: recordId,
    prep_number,
    method_revision_id: null,
    analyte_id: null,
    status: "draft",
    planned_target_concentration_mg_per_ml: plan.targetConcentrationMgPerMl,
    planned_target_volume_ul: plan.finalVolumeUl,
    planned_calibration_level: ctx.calibrationLevel,
    sample_id: sample.batch_id,
    sample_context: { source, sample_id: sample.id, compound: sample.compound, resolved_compound: ctx.analyteName },
    plan: { warnings: plan.warnings, totalDilutionFactor: plan.totalDilutionFactor, stockConcentrationMgPerMl: plan.stockConcentrationMgPerMl },
    total_dilution_factor: plan.totalDilutionFactor,
    prepared_by: userId,
  };
  const { data: record, error } = existing
    ? await supabase.from("sp_preparation_records").update(row).eq("id", recordId).select("id, prep_number").single()
    : await supabase.from("sp_preparation_records").insert(row).select("id, prep_number").single();
  if (error) throw error;

  if (existing) {
    const { error: delErr } = await supabase.from("sp_preparation_steps").delete().eq("record_id", recordId);
    if (delErr) throw delErr;
  }
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

/**
 * Reconstitution volume choices for a dry (lyophilized) sample, driven by
 * its physical vial size -- Dustin's rule (2026-08-25): every vial the lab
 * uses is 3 mL or larger. A 3 mL vial (the smallest) only ever gets 1 mL or
 * 2 mL of diluent; a larger vial (5 mL, 10 mL, ...) can take anywhere from
 * 1 mL up to (vial size - 1 mL), always in whole-mL steps -- that's a
 * measured addition, not a pipetted volume, and no vial is ever filled to
 * the brim with diluent alone. Returns null when the vial size can't be
 * read as a real supported size (missing, unparseable, or below 3 mL) --
 * the caller surfaces that as needs-input rather than guessing a
 * reconstitution volume for math this precision-sensitive.
 */
export function reconstitutionCandidatesUl(containerSize: string | null | undefined): number[] | null {
  const m = (containerSize ?? "").match(/(\d+(?:\.\d+)?)\s*m\s*l/i);
  if (!m) return null;
  const vialMl = Math.round(parseFloat(m[1]));
  if (!Number.isFinite(vialMl) || vialMl < 3) return null;
  if (vialMl === 3) return [1000, 2000];
  const maxMl = vialMl - 1;
  return Array.from({ length: maxMl }, (_, i) => (i + 1) * 1000);
}

const VIAL_SIZE_NEEDS_INPUT = (containerSize: string | null | undefined): { ok: false; reason: NeedsInputReason; message: string } => ({
  ok: false, reason: "missing_as_received_data",
  message: `Vial size not recorded or unrecognized (container_size: "${containerSize ?? ""}") -- needed to pick a valid reconstitution volume. Every vial in use is 3 mL or larger.`,
});

/**
 * Shared by both call sites in this file and the queue-driven equivalents
 * in generate-from-queue.functions.ts -- resolves to either a single-
 * compound plan (planPreparation/persistPlan, unchanged) or a blend plan
 * (planBlendPreparation/persistBlendPlan, one shared dilution across all
 * of the blend's components), branching on `resolved.kind`.
 *
 * For a lyophilized/dry sample, the reconstitution volume isn't a single
 * fixed default -- it's chosen from the vial-size-driven candidates above,
 * picking whichever candidate lands the final achieved concentration(s)
 * closest to target (normalized by each compound's own calibration range,
 * same scoring shape pickSharedDilutionFactor already uses for blends).
 * The whole vial always gets reconstituted at once; only the diluent
 * volume varies between candidates.
 */
export async function planAndPersistForSample(
  supabase: SB, userId: string, sample: SampleCtx,
  resolved: ResolvedRevisionCtx | ResolvedBlendCtx,
  assets: LabAssets, overrides: Overrides | undefined, source: string,
): Promise<
  { ok: true; row: Omit<GeneratedRow, "run_list_item_id"> }
  | { ok: false; reason: NeedsInputReason; message: string }
> {
  if (resolved.kind === "blend") {
    const built = buildBlendPlanInput(sample, resolved);
    if (!built.ok) return built;
    const candidates = reconstitutionCandidatesUl(sample.container_size);
    if (!candidates) return VIAL_SIZE_NEEDS_INPUT(sample.container_size);

    let best: BlendPlan | null = null;
    let bestScore = Infinity;
    let lastError: string | undefined;
    for (const volumeUl of candidates) {
      const attempt = planBlendPreparation({ ...built.input, reconstitution: { ...built.input.reconstitution, volumeUl } });
      if (!attempt.ok) { lastError = attempt.error; continue; }
      let score = 0;
      for (const c of attempt.components) {
        const range = c.calMaxMgPerMl != null && c.calMinMgPerMl != null && c.calMaxMgPerMl > c.calMinMgPerMl ? c.calMaxMgPerMl - c.calMinMgPerMl : 1;
        score += Math.abs(c.resultingConcMgPerMl - c.targetConcMgPerMl) / range;
      }
      if (score < bestScore) { bestScore = score; best = attempt; }
    }
    if (!best) return { ok: false, reason: "plan_error", message: lastError ?? "Could not compute a blend plan for any valid reconstitution volume." };

    const plan = best;
    const { prep_id, prep_number } = await persistBlendPlan(supabase, userId, sample, resolved, plan, source);
    const primary = plan.components[0];
    const droppedWarnings = built.droppedComponents.map(n => `"${n}" from the sample's text didn't match a known component of ${resolved.blendName} — skipped.`);
    return {
      ok: true,
      row: {
        sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
        warnings: [...plan.warnings.map(w => w.message), ...droppedWarnings],
        steps: plan.steps.map(s => s.instruction),
        targetConcentrationMgPerMl: primary?.targetConcMgPerMl ?? 0,
        calibrationLevel: primary?.calibrationLevel ?? null,
        totalDilutionFactor: plan.totalDilutionFactor,
        stockConcentrationMgPerMl: primary?.stockConcMgPerMl ?? null,
        components: plan.components,
      },
    };
  }

  const built = buildPlanInput(sample, resolved, overrides, assets);
  if (!built.ok) return built;

  let plan: PrepPlan;
  if (built.input.source.form === "lyophilized") {
    const candidates = reconstitutionCandidatesUl(sample.container_size);
    if (!candidates) return VIAL_SIZE_NEEDS_INPUT(sample.container_size);
    const range = resolved.calMaxMgPerMl != null && resolved.calMinMgPerMl != null && resolved.calMaxMgPerMl > resolved.calMinMgPerMl
      ? resolved.calMaxMgPerMl - resolved.calMinMgPerMl : 1;

    let best: PrepPlan | null = null;
    let bestScore = Infinity;
    let lastError: string | undefined;
    for (const volumeUl of candidates) {
      const attempt = planPreparation({ ...built.input, reconstitution: { ...built.input.reconstitution, volumeUl } });
      if (!attempt.ok) { lastError = attempt.error; continue; }
      const achieved = attempt.steps[attempt.steps.length - 1]?.resultingMgPerMl ?? attempt.targetConcentrationMgPerMl;
      const score = Math.abs(achieved - resolved.targetConcMgPerMl) / range;
      if (score < bestScore) { bestScore = score; best = attempt; }
    }
    if (!best) return { ok: false, reason: "plan_error", message: lastError ?? "Could not compute a plan for any valid reconstitution volume." };
    plan = best;
  } else {
    plan = planPreparation(built.input);
    if (!plan.ok) return { ok: false, reason: "plan_error", message: plan.error ?? "Could not compute a plan." };
  }

  const { prep_id, prep_number } = await persistPlan(supabase, userId, sample, resolved, plan, source);
  return {
    ok: true,
    row: {
      sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, prep_id, prep_number,
      warnings: plan.warnings.map(w => w.message), steps: plan.steps.map(s => s.instruction),
      targetConcentrationMgPerMl: plan.targetConcentrationMgPerMl, calibrationLevel: resolved.calibrationLevel,
      totalDilutionFactor: plan.totalDilutionFactor, stockConcentrationMgPerMl: plan.stockConcentrationMgPerMl,
    },
  };
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
    ? await supabase.from("samples").select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent, container_size").in("id", sampleIds)
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

    const settings = await loadGlobalPrepSettings(context.supabase);
    const [{ byCompoundLower }, assets] = await Promise.all([
      resolveCompoundContexts(context.supabase, Array.from(samples.values()), settings),
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
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: resolved?.reason ?? "no_calibration_data", message: resolved?.message ?? "Could not resolve a calibration target." });
        continue;
      }
      const result = await planAndPersistForSample(context.supabase, context.userId, sample, resolved, assets, undefined, "run_list");
      if (!result.ok) {
        needsInput.push({ run_list_item_id: item.id, sample_id: sample.id, batch_id: sample.batch_id, compound: sample.compound, reason: result.reason, message: result.message });
        continue;
      }
      await context.supabase.from("run_list_items").update({ sp_preparation_record_id: result.row.prep_id }).eq("id", item.id);
      created.push({ run_list_item_id: item.id, ...result.row });
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
      .from("samples").select("id, batch_id, compound, compound_id, concentration, received_form, received_quantity, received_quantity_unit, received_purity_percent, container_size")
      .eq("id", item.sample_id).single();
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

    const result = await planAndPersistForSample(context.supabase, context.userId, sample, resolved, assets, data.overrides, "run_list");
    if (!result.ok) throw new Error(result.message);
    await context.supabase.from("run_list_items").update({ sp_preparation_record_id: result.row.prep_id }).eq("id", item.id);
    return { run_list_item_id: item.id, ...result.row } satisfies GeneratedRow;
  });

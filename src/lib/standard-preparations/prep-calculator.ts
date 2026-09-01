/**
 * Deterministic lab prep calculator for HPLC standards and samples.
 *
 * Dustin, 2026-09-01, handing over a formal spec after the KLOW overflow
 * case (4 compounds, 5000 uL flask, 15000 uL of stock needed) surfaced as
 * a soft warning instead of a hard failure: "Do not invent chemistry. Do
 * not guess volumes. Do not 'approximately' fit a recipe into a flask...
 * If it is not possible, FAIL with a reason and the minimum stock
 * concentration or flask volume that would make it possible."
 *
 * This module is the spec, implemented literally. It does not know about
 * compounds.cal_l1..l6, retention times, or any other library data --
 * every number it touches comes in through its arguments. It does not
 * round anything until every feasibility check has already run on exact
 * C1V1 math ("never round a volume first and then check fit" -- rounding
 * a borderline value before comparing it to a threshold is exactly how a
 * genuinely infeasible recipe gets reported as fine).
 *
 * Precision is tenths of a microliter, not the 5 uL grid the rest of this
 * app's dilution math uses (dilution.ts, intermediate-stocks.ts). That is
 * deliberate, not an inconsistency to fix -- this spec calls for "integers
 * or exact tenths only after math," a finer-grained, explicitly different
 * rule for this calculator.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PrepCompound {
  id: string;
  name: string;
}

export interface PrepStock {
  compound_id: string;
  conc_mg_ml: number;
  /** Volume of this stock actually on hand. Omit/null if not tracked. */
  available_ul?: number | null;
}

export interface PrepTarget {
  level_id: string;
  compound_id: string;
  conc_mg_ml: number;
}

export interface SerialOptions {
  /** Operator will not pipette below this. Default 50. */
  min_pipette_ul?: number;
  /** e.g. [100, 200, 250, 500, 1000] -- used only for the nice-volume pass. */
  preferred_pipette_uls?: number[];
  diluent_name: string;
  allow_serial?: boolean;
  /** Number of intermediate-then-flask transfers allowed. Default 2. */
  max_serial_steps?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface PrepComponentResult {
  compound: string;
  stock_mg_ml: number;
  target_mg_ml: number;
  /** Single direct transfer. Present when the compound didn't need serial dilution. */
  take_ul?: number;
  /** Present instead of take_ul when this compound needed a serial plan. */
  serial?: SerialStep[];
}

export interface SerialStep {
  take_ul: number;
  diluent_ul: number;
  /** Dilution factor of THIS step relative to its own source. */
  factor: number;
  resulting_conc: number;
}

export interface PrepCheck {
  recon_conc: string;
  volume_balance: string;
}

export interface NiceVolumeSuggestion {
  flask_ul: number;
  reason: string;
}

export interface PrepLevelOk {
  level_id: string;
  possible: true;
  flask_ul: number;
  components: PrepComponentResult[];
  sum_stock_ul: number;
  diluent_ul: number;
  diluent: string;
  check: PrepCheck;
  warnings: string[];
  nice_volume_suggestion: NiceVolumeSuggestion | null;
}

export interface PrepLevelFail {
  level_id: string;
  possible: false;
  reason: string;
  flask_ul: number;
  sum_stock_ul?: number;
  shortfall_ul?: number;
  /** Per compound: what its stock would need to be, all else held fixed. */
  min_stock_conc_mg_ml?: Record<string, number>;
  min_flask_ul?: number;
  fix_suggestions: string[];
}

export type PrepLevelResult = PrepLevelOk | PrepLevelFail;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute tolerance for feasibility comparisons, in uL. Not a rounding grid --
 * purely to keep floating-point division from flipping a mathematically-exact
 * boundary (sum_stock_ul === flask_ul, or a draw === min_pipette_ul) the
 * wrong way. */
const EPS_UL = 1e-6;

/** "Integers or exact tenths only after math" -- applied ONLY for display,
 * never before a feasibility check. */
function toTenths(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * "Integers or exact tenths" is a rule about VOLUMES (uL) -- the spec's own
 * disallowed example, "round 6.667 uL to 7 uL," is a volume. Concentrations
 * in this domain live well under 1 mg/mL (the compound library's whole
 * calibration grid is 0.005 mg/mL steps), so running toTenths on one -- as
 * an earlier version of this file did -- rounds a real 0.006667 result to
 * 0.0 and silently erases it. Six significant figures keeps float noise out
 * of the display without doing that.
 */
function roundConc(v: number): number {
  if (!(v > 0)) return v;
  return Number(v.toPrecision(6));
}

/** Serial intermediates are preferentially built from these factors, in this
 * order, per spec ("Prefer factors of 10 and 15"). Larger fallbacks exist so
 * a genuinely tiny direct draw still finds a plan within max_serial_steps. */
const PREFERRED_SERIAL_FACTORS = [10, 15, 20, 25, 50, 100, 150, 200, 250, 500, 1000];

/** Round, clean total volumes to build an intermediate up to. */
const INTERMEDIATE_VOLUMES_UL = [500, 1000, 1500, 2000, 5000, 10000];

// ---------------------------------------------------------------------------
// Core: one level
// ---------------------------------------------------------------------------

export interface ComputeLevelInput {
  level_id: string;
  flask_ul: number;
  /** This level's targets only -- {compound_id, conc_mg_ml} pairs. */
  targets: Array<{ compound_id: string; conc_mg_ml: number }>;
  compounds: PrepCompound[];
  stocks: PrepStock[];
  options: SerialOptions;
}

function compoundName(id: string, compounds: PrepCompound[]): string {
  return compounds.find(c => c.id === id)?.name ?? id;
}

function stockFor(id: string, stocks: PrepStock[]): PrepStock | undefined {
  return stocks.find(s => s.compound_id === id);
}

/**
 * Builds a 2-transfer serial plan (make an intermediate, then draw from it
 * straight into the flask) for one compound whose direct draw falls under
 * min_pipette_ul. Returns null if no plan within max_serial_steps clears the
 * floor at every transfer -- the caller must then FAIL the level, per spec:
 * serial dilution rescues a too-small draw, it never rescues an overflow.
 *
 * Math, exact (no rounding until the caller formats for display):
 *   direct_ul = target_conc * flask_ul / stock_conc      (the draw we can't take)
 *   intermediate is stock diluted by factor F: conc = stock_conc / F
 *   drawing v2 = direct_ul * F of that intermediate into flask_ul reproduces
 *   target_conc exactly, by construction -- F cancels out of the concentration,
 *   it only ever changes how much volume that concentration is packaged in.
 */
function buildSerialPlan(
  directUl: number, stockConc: number, minPipetteUl: number, flaskUl: number, maxSteps: number,
): SerialStep[] | null {
  if (maxSteps < 2) return null; // a serial plan is inherently a 2-transfer minimum here

  let best: SerialStep[] | null = null;
  let bestFactor = Infinity;

  for (const F of PREFERRED_SERIAL_FACTORS) {
    const v2 = directUl * F; // final draw, from the intermediate, into the flask
    if (v2 < minPipetteUl - EPS_UL) continue; // this factor still isn't enough
    if (v2 > flaskUl + EPS_UL) continue; // can't draw more than the flask holds

    for (const interVol of INTERMEDIATE_VOLUMES_UL) {
      const aliquot1 = interVol / F; // primary stock taken to build the intermediate
      if (aliquot1 < minPipetteUl - EPS_UL) continue;
      if (aliquot1 > interVol + EPS_UL) continue;

      // First factor small enough to clear the floor wins -- smaller F means
      // fewer serial dilutions' worth of accumulated volumetric error.
      if (F < bestFactor) {
        bestFactor = F;
        // Each step's factor is ITS OWN dilution ratio (this step's total
        // volume / this step's take), not the same F repeated -- step 1
        // dilutes the primary by F, step 2 dilutes THAT intermediate by
        // flaskUl/v2, and the two multiply to the combined factor (matches
        // spec's own worked example: 10x then 15x -> 150x combined, not
        // 10x then 10x).
        best = [
          { take_ul: aliquot1, diluent_ul: interVol - aliquot1, factor: F, resulting_conc: stockConc / F },
          { take_ul: v2, diluent_ul: flaskUl - v2, factor: roundConc(flaskUl / v2), resulting_conc: (stockConc / F) * (v2 / flaskUl) },
        ];
      }
      break; // smallest viable intermediate volume for this F is enough
    }
  }
  return best;
}

/**
 * Given an overflowing level, computes -- per offending compound, holding
 * every OTHER compound's draw fixed -- what that one compound's stock would
 * need to be to absorb the entire shortfall on its own. Not a claim that
 * strengthening ALL of them is necessary; it's "if you fix it with just this
 * one," reported per compound so the real decision (which stock to actually
 * strengthen) stays with the person who knows what's available to make.
 */
function minStockConcSuggestions(
  targets: Array<{ compound_id: string; conc_mg_ml: number }>,
  stocks: PrepStock[], compounds: PrepCompound[], flaskUl: number, shortfallUl: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of targets) {
    const stock = stockFor(t.compound_id, stocks);
    if (!stock || !(stock.conc_mg_ml > 0)) continue;
    const currentTake = (t.conc_mg_ml * flaskUl) / stock.conc_mg_ml;
    const neededTake = currentTake - shortfallUl;
    if (!(neededTake > 0)) continue; // this compound alone can't absorb the whole shortfall
    const name = compoundName(t.compound_id, compounds);
    out[name] = (t.conc_mg_ml * flaskUl) / neededTake;
  }
  return out;
}

export function computeLevel(input: ComputeLevelInput): PrepLevelResult {
  const { level_id, flask_ul, targets, compounds, stocks, options } = input;
  const minPipetteUl = options.min_pipette_ul ?? 50;
  const maxSerialSteps = options.max_serial_steps ?? 2;
  const allowSerial = options.allow_serial ?? false;

  if (!(flask_ul > 0)) {
    return { level_id, possible: false, reason: "flask_ul must be > 0", flask_ul, fix_suggestions: [] };
  }

  // Constraint 1: every target compound must have a valid, positive stock.
  const missing = targets.filter(t => {
    const s = stockFor(t.compound_id, stocks);
    return !s || !(s.conc_mg_ml > 0);
  });
  if (missing.length) {
    const names = missing.map(t => compoundName(t.compound_id, compounds));
    return {
      level_id, possible: false,
      reason: `missing or invalid stock concentration for: ${names.join(", ")}`,
      flask_ul,
      fix_suggestions: names.map(n => `record a positive stock concentration for ${n}`),
    };
  }

  // Exact C1V1 for every compound, no rounding.
  const exact = targets.map(t => {
    const stock = stockFor(t.compound_id, stocks)!;
    const takeUl = (t.conc_mg_ml * flask_ul) / stock.conc_mg_ml;
    return { target: t, stock, takeUl };
  });

  // Constraint 2: a positive target must produce a positive draw. (Division
  // of two positive finite numbers always is; this guards NaN/Infinity from
  // a malformed input rather than real chemistry.)
  const invalid = exact.filter(e => e.target.conc_mg_ml > 0 && !(e.takeUl > 0));
  if (invalid.length) {
    const names = invalid.map(e => compoundName(e.target.compound_id, compounds));
    return {
      level_id, possible: false,
      reason: `computed a non-positive draw for: ${names.join(", ")} -- check target/stock units`,
      flask_ul, fix_suggestions: [],
    };
  }

  const sumStockUl = exact.reduce((s, e) => s + e.takeUl, 0);

  // Constraint 3/4: overflow. This is a stock/flask problem -- serial
  // dilution cannot rescue it, because F cancels out of concentration and
  // never reduces how much total stock-equivalent has to end up in the
  // flask. Checked on the EXACT sum, before any rounding.
  if (sumStockUl > flask_ul + EPS_UL) {
    const shortfallUl = sumStockUl - flask_ul;
    const perCompound = minStockConcSuggestions(targets, stocks, compounds, flask_ul, shortfallUl);
    const fixes: string[] = [];
    for (const [name, conc] of Object.entries(perCompound)) {
      fixes.push(`raise ${name}'s stock to at least ${roundConc(conc)} mg/mL (all else unchanged)`);
    }
    // Spec's own worked example is symmetric -- N identical compounds, no
    // single one can absorb the shortfall alone (which is exactly why
    // perCompound comes up empty here: every neededTake in
    // minStockConcSuggestions goes negative). "If all non-GHK stocks share
    // concentration S: n*(c*flask/S) + v_ghk < flask" -- generalized, this
    // is just "scale every offending stock up by the same factor K":
    // sum_i(take_i/K) <= flask solves to K = sum_stock_ul/flask_ul.
    const uniformScale = sumStockUl / flask_ul;
    if (uniformScale > 1 + EPS_UL) {
      fixes.push(`or raise every listed compound's stock by ${roundConc(uniformScale)}x`);
    }
    fixes.push(`or raise flask_ul to at least ${toTenths(sumStockUl)} µL`);
    return {
      level_id, possible: false, reason: "stock overflow",
      flask_ul, sum_stock_ul: toTenths(sumStockUl), shortfall_ul: toTenths(shortfallUl),
      min_stock_conc_mg_ml: Object.fromEntries(Object.entries(perCompound).map(([k, v]) => [k, roundConc(v)])),
      min_flask_ul: toTenths(sumStockUl),
      fix_suggestions: fixes,
    };
  }

  // Constraint 6: never recommend pipetting more than what's on hand.
  const shortOnStock = exact.filter(e => e.stock.available_ul != null && e.takeUl > e.stock.available_ul! + EPS_UL);
  if (shortOnStock.length) {
    const names = shortOnStock.map(e => compoundName(e.target.compound_id, compounds));
    return {
      level_id, possible: false,
      reason: `not enough stock on hand for: ${names.join(", ")}`,
      flask_ul, sum_stock_ul: toTenths(sumStockUl),
      fix_suggestions: shortOnStock.map(e =>
        `${compoundName(e.target.compound_id, compounds)} needs ${toTenths(e.takeUl)} µL of stock, `
        + `only ${e.stock.available_ul} µL on hand`),
    };
  }

  // Constraint 5: every DIRECT transfer must clear the pipette floor, unless
  // a serial plan rescues it.
  const components: PrepComponentResult[] = [];
  const warnings: string[] = [];
  for (const e of exact) {
    const name = compoundName(e.target.compound_id, compounds);
    if (e.takeUl >= minPipetteUl - EPS_UL) {
      components.push({ compound: name, stock_mg_ml: e.stock.conc_mg_ml, target_mg_ml: e.target.conc_mg_ml, take_ul: toTenths(e.takeUl) });
      continue;
    }
    if (!allowSerial) {
      return {
        level_id, possible: false,
        reason: `${name}'s direct draw (${toTenths(e.takeUl)} µL) is under the ${minPipetteUl} µL pipette floor`,
        flask_ul, sum_stock_ul: toTenths(sumStockUl),
        fix_suggestions: [
          `enable serial dilution for ${name}`,
          // A too-small draw needs a WEAKER stock to grow it, not a
          // stronger one -- draw = target*flask/stock, so shrinking stock
          // is what grows the draw. (The overflow branch above is the
          // mirror-image case, correctly asking for a STRONGER stock
          // there, because that one needs the draw to shrink instead.)
          `or use a weaker ${name} stock (<= ${roundConc((e.takeUl / minPipetteUl) * e.stock.conc_mg_ml)} mg/mL makes the direct draw exactly ${minPipetteUl} µL)`,
        ],
      };
    }
    const plan = buildSerialPlan(e.takeUl, e.stock.conc_mg_ml, minPipetteUl, flask_ul, maxSerialSteps);
    if (!plan) {
      return {
        level_id, possible: false,
        reason: `no serial plan for ${name} clears the ${minPipetteUl} µL floor within ${maxSerialSteps} step(s) `
          + `(direct draw would be ${toTenths(e.takeUl)} µL)`,
        flask_ul, sum_stock_ul: toTenths(sumStockUl),
        fix_suggestions: [`raise max_serial_steps`, `or use a stronger ${name} stock`],
      };
    }
    components.push({
      compound: name, stock_mg_ml: e.stock.conc_mg_ml, target_mg_ml: e.target.conc_mg_ml,
      serial: plan.map(s => ({ ...s, take_ul: toTenths(s.take_ul), diluent_ul: toTenths(s.diluent_ul), resulting_conc: roundConc(s.resulting_conc) })),
    });
  }

  const diluentUl = flask_ul - sumStockUl;
  if (diluentUl < flask_ul * 0.1 && diluentUl > EPS_UL) {
    warnings.push(`only ${toTenths(diluentUl)} µL of diluent -- barely a dilution; a stronger primary stock would give more room`);
  }

  const niceVolumeSuggestion = suggestNiceFlask(exact.map(e => e.takeUl), flask_ul, options.preferred_pipette_uls);

  return {
    level_id, possible: true, flask_ul,
    components,
    sum_stock_ul: toTenths(sumStockUl),
    diluent_ul: toTenths(diluentUl),
    diluent: options.diluent_name,
    check: {
      recon_conc: "each target_mg_ml == stock_mg_ml * take_ul / flask_ul",
      volume_balance: "sum_stock_ul + diluent_ul == flask_ul",
    },
    warnings,
    nice_volume_suggestion: niceVolumeSuggestion,
  };
}

/**
 * Optional, additive: is there a nearby flask_ul that makes every direct
 * take_ul land on (or very near) a preferred pipette volume, scaling all of
 * them by the same factor? Never touches target_conc -- per spec, the only
 * thing allowed to move here is the flask size.
 */
function suggestNiceFlask(
  takesUl: number[], currentFlaskUl: number, preferred?: number[],
): NiceVolumeSuggestion | null {
  const wishlist = preferred?.length ? preferred : [100, 200, 250, 500, 1000];
  if (!takesUl.length) return null;
  const alreadyNice = takesUl.every(v => wishlist.some(p => Math.abs(v - p) < 0.5));
  if (alreadyNice) return null;

  const driving = Math.max(...takesUl);
  let best: { flaskUl: number; score: number } | null = null;
  for (const target of wishlist) {
    const scale = target / driving;
    const candidateFlask = currentFlaskUl * scale;
    if (!(candidateFlask > 0)) continue;
    const scaledTakes = takesUl.map(v => v * scale);
    const score = scaledTakes.reduce((s, v) => s + Math.min(...wishlist.map(p => Math.abs(v - p))), 0);
    if (!best || score < best.score) best = { flaskUl: candidateFlask, score };
  }
  if (!best || best.score > 0.5 * takesUl.length) return null; // not actually nice, don't suggest it
  return {
    flask_ul: toTenths(best.flaskUl),
    reason: `scales every direct draw onto a round pipette volume without changing any target concentration`,
  };
}

// ---------------------------------------------------------------------------
// Multi-level batch -- each level independent, per spec ("a bad L6 does not
// contaminate L1"). No cross-level reuse unless the caller explicitly asks
// (not implemented here: this module has no such mode, matching the
// "Default is independent flasks from stocks" instruction).
// ---------------------------------------------------------------------------

export interface ComputeBatchInput {
  compounds: PrepCompound[];
  stocks: PrepStock[];
  targets: PrepTarget[];
  /** One flask size for every level, unless overridden per level_id below. */
  flask_ul: number;
  flask_ul_by_level?: Record<string, number>;
  options: SerialOptions;
}

export function computeBatch(input: ComputeBatchInput): PrepLevelResult[] {
  const byLevel = new Map<string, Array<{ compound_id: string; conc_mg_ml: number }>>();
  for (const t of input.targets) {
    const list = byLevel.get(t.level_id) ?? [];
    list.push({ compound_id: t.compound_id, conc_mg_ml: t.conc_mg_ml });
    byLevel.set(t.level_id, list);
  }
  return [...byLevel.entries()].map(([level_id, targets]) => computeLevel({
    level_id,
    flask_ul: input.flask_ul_by_level?.[level_id] ?? input.flask_ul,
    targets,
    compounds: input.compounds,
    stocks: input.stocks,
    options: input.options,
  }));
}

// ---------------------------------------------------------------------------
// Samples -- same engine, one synthetic "compound" per spec: "A sample
// dilution (e.g. 150x into 1500 uL) is the same math with one compound and
// target_conc = stock / factor."
// ---------------------------------------------------------------------------

export function computeSampleDilution(args: {
  sampleName: string;
  stockConcMgPerMl: number;
  factor: number;
  flaskUl: number;
  options: SerialOptions;
  availableUl?: number | null;
}): PrepLevelResult {
  const compoundId = "sample";
  return computeLevel({
    level_id: args.sampleName,
    flask_ul: args.flaskUl,
    targets: [{ compound_id: compoundId, conc_mg_ml: args.stockConcMgPerMl / args.factor }],
    compounds: [{ id: compoundId, name: args.sampleName }],
    stocks: [{ compound_id: compoundId, conc_mg_ml: args.stockConcMgPerMl, available_ul: args.availableUl }],
    options: args.options,
  });
}

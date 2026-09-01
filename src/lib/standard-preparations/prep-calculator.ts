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
 * every number it touches comes in through its arguments. Every DERIVATION
 * runs on exact C1V1 math, unrounded; only the number actually printed on a
 * recipe -- a take_ul, a diluent_ul, an aliquot -- gets snapped to a grid,
 * and every feasibility check (floor, overflow) is re-run against THAT
 * snapped number, not the exact one it came from ("never round a volume
 * and then skip re-checking fit" -- a value that's fine exact and not fine
 * rounded is exactly how a genuinely infeasible recipe gets reported as
 * fine).
 *
 * Dustin, 2026-09-01, after a 49 uL draw reached a printed cut sheet:
 * "If a volume... is not divisible by 5, its wrong. Period." This module
 * originally used tenths-of-a-microliter precision instead of the 5 uL grid
 * the rest of this app's dilution math uses (dilution.ts,
 * intermediate-stocks.ts), on the theory that finer precision was strictly
 * safer. It wasn't -- a real pipettor doesn't have a tenths-of-a-microliter
 * setting, so "23.4 uL, exactly as computed" is exactly as unpipettable as
 * the oddball volumes the rest of the app was already built to refuse. The
 * 5 uL grid is not a display nicety here, it is the same physical
 * constraint as the pipette floor: reuses roundToVolumeGrid from
 * dilution.ts so both rules speak the same grid.
 */

import { roundToVolumeGrid } from "@/lib/sample-prep/dilution";

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
  /**
   * Softer than min_pipette_ul: a direct draw between the two is allowed --
   * it clears the hard floor -- but flagged, so lowering the hard floor to
   * whatever's technically achievable doesn't make a 20 uL draw look as
   * clean as a 100 uL one. Absent means no soft threshold, only the hard one.
   */
  preferred_min_pipette_ul?: number;
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
  /**
   * What this component's stock/diluent volumes -- grid-rounded to a real
   * pipettable number, not the exact target -- actually deliver. Shown
   * rather than hidden, same principle as every other rounding boundary in
   * this app: a 5 uL grid step moves this off target_mg_ml by a small,
   * real amount, and the achieved number is what should be checked against
   * the printed target on review, not assumed identical to it.
   */
  achieved_mg_ml: number;
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

/** Cosmetic rounding for numbers that are never pipetted -- explanatory
 * text in a FAIL reason, not an instruction on a recipe. */
function toTenths(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Every volume that ends up on a recipe -- a take_ul, a diluent_ul, an
 * aliquot -- goes through this, never toTenths. Reuses dilution.ts's own
 * grid so this module and the rest of the app's pipetting math agree on
 * what "a real volume" means.
 */
function gridVolume(v: number): number {
  return roundToVolumeGrid(v);
}

/**
 * For a suggested MINIMUM (a flask big enough, a stock strong enough) --
 * rounds up, never down, so the suggestion stays sufficient. Rounding a
 * minimum to the nearest grid point can round it down and hand back a
 * number that's still short.
 */
function ceilToVolumeGrid(v: number): number {
  return Math.ceil(v / 5) * 5;
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
 * Lower is more round-looking. Every candidate here is already a legal
 * multiple of 5 -- this only breaks ties between legal candidates, same
 * spirit as niceUnit in freeform-spread.ts: 5 µL is the hard floor a
 * volume must clear, not a claim that 35, 65, and 85 are as easy to read
 * at a glance as 25, 50, and 100.
 *
 * Quarters are the top tier, not hundreds -- "step by quarter, half, or
 * whole" is the mental model this is scoring against, and under it 50 is
 * exactly as clean as 100. Scoring 100 above 50 would reward a bigger,
 * more wasteful intermediate purely for a digit it doesn't need: two
 * numbers that are already equally easy to read at a glance shouldn't
 * make the search prefer the one that burns more stock.
 */
function volumeNiceness(v: number): number {
  if (v % 25 === 0) return 0; // 25/50/75/100/125... -- quarter, half, whole
  if (v % 10 === 0) return 1; // 10/20/30/40... -- clean, off the quarter grid
  return 2; // still legal -- a multiple of 5, just not a round-looking one
}

/**
 * Builds a 2-transfer serial plan (make an intermediate, then draw from it
 * straight into the flask) for one compound whose direct draw falls under
 * min_pipette_ul. Returns null if no plan within max_serial_steps clears the
 * floor at every transfer, on the grid, -- the caller must then FAIL the
 * level, per spec: serial dilution rescues a too-small draw, it never
 * rescues an overflow.
 *
 * Every transfer here is a real pipetted volume, so every transfer is
 * grid-rounded, and every downstream number is re-derived from the ROUNDED
 * one, not the idealized exact one:
 *   1. aliquot1 = interVol / F, exact, then snapped to the grid.
 *   2. The intermediate's ACTUAL concentration comes from the snapped
 *      aliquot1, not from stockConc/F -- those only agree when interVol/F
 *      happened to land on the grid already, which is the exception.
 *   3. v2 (the draw that reproduces target_mg_ml) is solved from that
 *      ACTUAL concentration, then it too is snapped to the grid.
 *   4. What v2 actually reproduces -- achieved_mg_ml -- is derived one more
 *      time, from the snapped v2. It is reported, not silently treated as
 *      target_mg_ml: two grid roundings compound, and target_mg_ml stays
 *      the printed goal, achieved_mg_ml is what a re-injection would read.
 *
 * Smallest F wins, same as before -- fewer serial dilutions' worth of
 * accumulated volumetric error. But F alone doesn't pick a unique plan:
 * several intermediate volumes can be legal for the same F, and they don't
 * all read the same at the bench (25 µL of a 1000 µL intermediate vs. 25 µL
 * of a 500 µL one are both legal, 500 is the one worth making). Every legal
 * candidate at the WINNING F is scored on volumeNiceness and the best one
 * is returned -- the search never trades a smaller F for a rounder one.
 */
function buildSerialPlan(
  directUl: number, targetMgMl: number, stockConc: number, minPipetteUl: number, flaskUl: number, maxSteps: number,
): SerialStep[] | null {
  if (maxSteps < 2) return null; // a serial plan is inherently a 2-transfer minimum here

  for (const F of PREFERRED_SERIAL_FACTORS) {
    const v2Estimate = directUl * F; // rough final draw, to size-check this factor before grid work
    if (v2Estimate < minPipetteUl - EPS_UL) continue; // this factor still isn't enough
    if (v2Estimate > flaskUl + EPS_UL) continue; // can't draw more than the flask holds

    let best: { steps: SerialStep[]; score: number } | null = null;
    for (const interVol of INTERMEDIATE_VOLUMES_UL) {
      const aliquot1Exact = interVol / F; // primary stock taken to build the intermediate
      if (aliquot1Exact < minPipetteUl - EPS_UL) continue;
      if (aliquot1Exact > interVol + EPS_UL) continue;

      const aliquot1 = gridVolume(aliquot1Exact);
      if (aliquot1 < minPipetteUl - EPS_UL) continue; // grid rounding pushed it back under the floor
      if (aliquot1 > interVol + EPS_UL) continue;

      // Real concentration of the intermediate as it will actually be made.
      const actualInterConc = (stockConc * aliquot1) / interVol;
      const v2Exact = (targetMgMl * flaskUl) / actualInterConc; // draw needed from THAT stock, exact
      const v2 = gridVolume(v2Exact);
      if (v2 < minPipetteUl - EPS_UL) continue;
      if (v2 > flaskUl + EPS_UL) continue;

      const score = volumeNiceness(aliquot1) + volumeNiceness(interVol) + volumeNiceness(v2);
      if (best && score >= best.score) continue; // a later, equally-or-less-nice candidate never replaces an earlier one

      best = {
        score,
        steps: [
          { take_ul: aliquot1, diluent_ul: interVol - aliquot1, factor: F, resulting_conc: roundConc(actualInterConc) },
          {
            take_ul: v2, diluent_ul: flaskUl - v2, factor: roundConc(flaskUl / v2),
            resulting_conc: roundConc((actualInterConc * v2) / flaskUl),
          },
        ],
      };
      if (score === 0) break; // can't do better than every volume landing on a clean hundred
    }
    if (best) return best.steps; // this F has a legal plan -- don't fall through to a larger, noisier F
  }
  return null;
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
    fixes.push(`or raise flask_ul to at least ${ceilToVolumeGrid(sumStockUl)} µL`);
    return {
      level_id, possible: false, reason: "stock overflow",
      flask_ul, sum_stock_ul: toTenths(sumStockUl), shortfall_ul: toTenths(shortfallUl),
      min_stock_conc_mg_ml: Object.fromEntries(Object.entries(perCompound).map(([k, v]) => [k, roundConc(v)])),
      min_flask_ul: ceilToVolumeGrid(sumStockUl),
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
  // The physical volume that actually lands in the flask for each compound --
  // the direct draw, OR the serial plan's final transfer when one was needed.
  // sumStockUl (above) is the pre-rescue C1V1 sum and is ONLY valid for the
  // early "even the direct draws overflow" check; a serial rescue inflates a
  // compound's real draw by its factor; a level that fits on paper can still
  // overflow once that inflation is applied, and diluent_ul has to be struck
  // against what actually gets pipetted, not the number rescued away.
  const actualTakes: number[] = [];
  for (const e of exact) {
    const name = compoundName(e.target.compound_id, compounds);
    // The grid-rounded draw is the one that has to clear the floor -- it's
    // the volume that actually gets pipetted. Rounding can move a draw to
    // either side of the floor (19.9 -> 20 clears it; 22 -> 20 still clears
    // it; 17 -> 15 doesn't), so the floor check runs AFTER rounding, not on
    // the exact value that led to it.
    const roundedDirect = gridVolume(e.takeUl);
    if (roundedDirect >= minPipetteUl - EPS_UL) {
      const achieved = roundConc((e.stock.conc_mg_ml * roundedDirect) / flask_ul);
      components.push({
        compound: name, stock_mg_ml: e.stock.conc_mg_ml, target_mg_ml: e.target.conc_mg_ml,
        achieved_mg_ml: achieved, take_ul: roundedDirect,
      });
      actualTakes.push(roundedDirect);
      if (options.preferred_min_pipette_ul != null && roundedDirect < options.preferred_min_pipette_ul - EPS_UL) {
        warnings.push(
          `${name}'s direct draw (${roundedDirect} µL) clears the ${minPipetteUl} µL floor but is under the `
          + `${options.preferred_min_pipette_ul} µL preferred minimum -- allowed, not ideal`,
        );
      }
      continue;
    }
    if (!allowSerial) {
      return {
        level_id, possible: false,
        reason: `${name}'s direct draw (${roundedDirect} µL on the 5 µL grid) is under the ${minPipetteUl} µL pipette floor`,
        flask_ul, sum_stock_ul: toTenths(sumStockUl),
        fix_suggestions: [
          `enable serial dilution for ${name}`,
          // A too-small draw needs a WEAKER stock to grow it, not a
          // stronger one -- draw = target*flask/stock, so shrinking stock
          // is what grows the draw. (The overflow branch above is the
          // mirror-image case, correctly asking for a STRONGER stock
          // there, because that one needs the draw to shrink instead.)
          `or use a weaker ${name} stock (<= ${roundConc((e.takeUl / minPipetteUl) * e.stock.conc_mg_ml)} mg/mL makes the direct draw at least ${minPipetteUl} µL)`,
        ],
      };
    }
    const plan = buildSerialPlan(e.takeUl, e.target.conc_mg_ml, e.stock.conc_mg_ml, minPipetteUl, flask_ul, maxSerialSteps);
    if (!plan) {
      return {
        level_id, possible: false,
        reason: `no serial plan for ${name} clears the ${minPipetteUl} µL floor on the 5 µL grid within ${maxSerialSteps} step(s) `
          + `(direct draw would be ${roundedDirect} µL)`,
        flask_ul, sum_stock_ul: toTenths(sumStockUl),
        fix_suggestions: [`raise max_serial_steps`, `or use a stronger ${name} stock`],
      };
    }
    const finalStep = plan[plan.length - 1];
    components.push({
      compound: name, stock_mg_ml: e.stock.conc_mg_ml, target_mg_ml: e.target.conc_mg_ml,
      achieved_mg_ml: finalStep.resulting_conc, serial: plan,
    });
    // The plan's own last step is the transfer that actually lands in the
    // flask -- already grid-rounded, by construction, inside buildSerialPlan.
    actualTakes.push(finalStep.take_ul);
  }

  // A level can pass the early, pre-rescue overflow check and still overflow
  // here: each serial rescue multiplies one compound's draw by its factor,
  // and nothing upstream re-summed after that multiplication. Per spec,
  // serial dilution rescues a too-small draw -- it must never be allowed to
  // quietly produce an overflow it can't rescue its way out of either.
  const actualSumUl = actualTakes.reduce((s, v) => s + v, 0);
  if (actualSumUl > flask_ul + EPS_UL) {
    const shortfallUl = actualSumUl - flask_ul;
    return {
      level_id, possible: false,
      reason: "stock overflow after serial dilution -- the serial transfers needed to clear the pipette floor add up to more than the flask holds",
      flask_ul, sum_stock_ul: toTenths(actualSumUl), shortfall_ul: toTenths(shortfallUl),
      min_flask_ul: ceilToVolumeGrid(actualSumUl),
      fix_suggestions: [
        `raise flask_ul to at least ${ceilToVolumeGrid(actualSumUl)} µL`,
        `or use a stronger stock for whichever compound(s) needed serial dilution, so they draw straight from the primary instead`,
      ],
    };
  }

  // flask_ul and every actualTakes entry are grid-conforming by this point,
  // so their difference already lands on the grid -- gridVolume here is a
  // safety net against float noise, not a real rounding step.
  const diluentUl = gridVolume(flask_ul - actualSumUl);
  if (diluentUl < flask_ul * 0.1 && diluentUl > EPS_UL) {
    warnings.push(`only ${diluentUl} µL of diluent -- barely a dilution; a stronger primary stock would give more room`);
  }

  const niceVolumeSuggestion = suggestNiceFlask(actualTakes, flask_ul, options.preferred_pipette_uls);

  return {
    level_id, possible: true, flask_ul,
    components,
    sum_stock_ul: actualSumUl,
    diluent_ul: diluentUl,
    diluent: options.diluent_name,
    check: {
      recon_conc: "each achieved_mg_ml == stock_mg_ml * take_ul / flask_ul, on the 5 µL grid",
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

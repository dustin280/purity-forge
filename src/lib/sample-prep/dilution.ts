/**
 * Dilution and serial-dilution math.
 * Concentrations normalize to mg/mL, volumes to µL, then display back in the
 * user's chosen units. Serial dilution engages when the required single-step
 * aliquot from stock would fall below the minimum pipette volume.
 */
export const MASS_UNITS = ["g", "mg", "ug"] as const;
export type MassUnit = (typeof MASS_UNITS)[number];

export const VOL_UNITS = ["mL", "uL"] as const;
export type VolUnit = (typeof VOL_UNITS)[number];

const MASS_TO_MG: Record<MassUnit, number> = { g: 1000, mg: 1, ug: 0.001 };
const VOL_TO_UL: Record<VolUnit, number> = { mL: 1000, uL: 1 };

/**
 * **Every pipetted volume is a multiple of 5 µL. That is the rule.**
 * Dustin, 2026-08-30: "divisible by 5 is first rule, maybe only rule...
 * absolutely nothing can be rounded, there is no close enough, this is high
 * precision work."
 *
 * One grid at every scale now. The old 50 µL coarse grid above 200 µL was a
 * second, needlessly blunt rule: 50 is itself divisible by 5, so it never
 * bought anything the 5 µL grid didn't, and it actively cost accuracy --
 * a 255 µL aliquot got dragged to 250.
 *
 * What this grid CANNOT do on its own is stop an ugly resulting
 * concentration, and it's worth being explicit about why, because it looks
 * like it should. 130 µL is a legal setting, but 20 mg reconstituted in
 * 3 mL is 6.666… mg/mL, so 130 µL of it is 0.8666… mg/mL -- a repeating
 * fraction inherited from the reconstitution, not from the aliquot. The fix
 * lives in the reconstitution-volume search (planAndPersistForSample), which
 * now prefers a volume that makes every resulting concentration an exact
 * decimal: the same 20 mg in 2 mL is 10.000 mg/mL, and 85 µL of that is
 * exactly 0.85.
 *
 * Callers recompute the achieved concentration from the volume actually
 * used, never from the pre-grid theoretical one.
 */
const GRID_UL = 5;

function gridFor(_uL: number): number {
  return GRID_UL;
}

export function roundToVolumeGrid(uL: number, floorUl = 0): number {
  if (uL <= 0) return 0;
  const grid = gridFor(uL);
  let rounded = Math.round(uL / grid) * grid;
  if (rounded < grid) rounded = grid;
  if (floorUl > 0 && rounded < floorUl) {
    const floorGrid = gridFor(floorUl);
    rounded = Math.ceil(floorUl / floorGrid) * floorGrid;
  }
  return rounded;
}

export interface DilutionChain {
  /** One aliquot per transfer, in order. Every entry is >= minPipetteUl. */
  aliquots: number[];
  /** What those transfers actually achieve, not what was asked for. */
  achievedDf: number;
}

/**
 * Builds a dilution as a chain of transfers where **every aliquot is at or
 * above the pipette floor** and on the volume grid.
 *
 * Dustin, 2026-08-30: nothing under 50 µL, ever -- "this magnifies error
 * dramatically. Just do a serial dilution if <50ul would be called for."
 * A single transfer into `finalVolUl` can only reach a factor of
 * finalVolUl / minPipetteUl (20x at 1 mL and a 50 µL floor); anything beyond
 * that has to be split across transfers rather than pipetted smaller.
 *
 * Replaces an earlier serial routine that required the total factor to be a
 * whole number and refused outright otherwise -- unusable here, because a
 * sample's factor is whatever its label mass and vial size make it
 * (10 mg in 1 mL to 0.42 mg/mL is 23.81x, not an integer). Instead this
 * enumerates the factors that are actually reachable on the grid and picks
 * the closest, which always exists.
 *
 * Steps are added only when they earn their place: an extra transfer carries
 * its own volumetric error, so the shortest chain that lands within TOL of
 * the target factor wins. Up to four transfers are available when the factor
 * genuinely needs them.
 */
export function bestChain(
  targetDf: number, finalVolUl: number, minPipetteUl: number, maxSteps = 4,
): DilutionChain | null {
  if (!(targetDf > 0) || !(finalVolUl > 0)) return null;
  const lo = Math.ceil(minPipetteUl / GRID_UL) * GRID_UL;
  const grid: number[] = [];
  for (let a = lo; a < finalVolUl; a += GRID_UL) grid.push(a);
  if (!grid.length) return null;

  // Error measured on the log of the factor: dilution is multiplicative, so
  // being 2x high and 2x low are equally wrong.
  const err = (df: number) => Math.abs(Math.log(df / targetDf));
  // How close a single transfer has to get before a second one is worth its
  // own volumetric error. Deliberately not tight: one transfer into 1 mL on
  // a 5 µL grid can only resolve the factor to about 10% near the 50 µL
  // floor (50 vs 55 µL is 20x vs 18.2x), so demanding 1% here would split
  // almost every prep in two to chase precision the grid cannot deliver.
  // The caller scores the concentration this actually achieves, so landing a
  // few percent off is visible rather than hidden.
  const TOL = Math.log(1.05);
  const stepDf = (a: number) => finalVolUl / a;

  // Among equally-accurate chains, prefer the balanced one. Splitting 23.8x
  // as 20x then 1.19x means a second transfer of 840 µL into 160 µL, which
  // is a transfer rather than a dilution and carries the first step's error
  // untouched; 4.88x twice is the same factor with half the strain on each
  // measurement.
  const imbalance = (as: number[]) => {
    const dfs = as.map(stepDf);
    return Math.max(...dfs) / Math.min(...dfs);
  };
  const better = (a: DilutionChain, b: DilutionChain | null) => {
    if (!b) return true;
    const ea = err(a.achievedDf), eb = err(b.achievedDf);
    if (Math.abs(ea - eb) > 1e-9) return ea < eb;
    return imbalance(a.aliquots) < imbalance(b.aliquots);
  };

  // The last aliquot follows in closed form from whatever the earlier ones
  // carried, so only its two grid neighbours need testing.
  const finish = (prefix: number[], carried: number): DilutionChain | null => {
    const need = targetDf / carried;
    if (!(need > 0)) return null;
    const ideal = finalVolUl / need;
    let out: DilutionChain | null = null;
    for (const snap of [Math.floor(ideal / GRID_UL) * GRID_UL, Math.ceil(ideal / GRID_UL) * GRID_UL]) {
      if (snap < lo || snap >= finalVolUl) continue;
      const cand = { aliquots: [...prefix, snap], achievedDf: carried * stepDf(snap) };
      if (better(cand, out)) out = cand;
    }
    return out;
  };

  // The largest factor a single transfer can achieve: the smallest legal
  // aliquot into the full final volume.
  const maxPerStep = stepDf(lo);

  // Best chain of exactly n transfers. Only the first n-1 aliquots are
  // searched; the last one is closed-form, so this is a depth-(n-1) walk.
  const bestOfLength = (n: number): DilutionChain | null => {
    let best: DilutionChain | null = null;
    const walk = (prefix: number[], carried: number) => {
      const remaining = n - prefix.length;
      if (remaining === 1) {
        const c = finish(prefix, carried);
        if (c && better(c, best)) best = c;
        return;
      }
      for (const a of grid) {
        const next = carried * stepDf(a);
        // stepDf falls as the aliquot grows, so overshooting here just means
        // this aliquot is still too small -- keep walking up the grid.
        if (next > targetDf) continue;
        // Past this point every remaining transfer contributes at most
        // maxPerStep, so a prefix already too weak to reach the target is
        // dead -- and so is every larger aliquot after it.
        if (next * Math.pow(maxPerStep, remaining - 1) < targetDf) break;
        walk([...prefix, a], next);
      }
    };
    walk([], 1);
    return best;
  };

  // Four transfers covers ~10^7 dilution off a 50 µL floor into 1 mL, which
  // is far beyond anything a real prep asks for, and the search cost climbs
  // steeply past it.
  const cap = Math.max(1, Math.min(Math.floor(maxSteps), 4));

  // Fewest transfers that lands within tolerance; otherwise whichever gets
  // closest at all. Never fall back to a shorter chain just because a longer
  // one wasn't found -- that is how a 500x request became a 20x plan.
  //
  // Searched shortest-first and returned on the first acceptable length: the
  // 4-transfer walk is the expensive one, and an everyday factor like 11.76x
  // is settled by a single transfer before it is ever reached.
  const bySteps: (DilutionChain | null)[] = [];
  for (let n = 1; n <= cap; n++) {
    const c = bestOfLength(n);
    bySteps[n] = c;
    if (c && err(c.achievedDf) <= TOL) return c;
  }
  return bySteps.filter(Boolean).reduce<DilutionChain | null>((b, c) => (better(c!, b) ? c! : b), null);
}

function concToMgPerMl(conc: number, mass: MassUnit, vol: VolUnit): number {
  // (mass * MASS_TO_MG mg) / (vol * VOL_TO_UL/1000 mL) = mg/mL
  const mg = conc * MASS_TO_MG[mass];
  const mL = (VOL_TO_UL[vol]) / 1000;
  return mg / mL;
}

function fmtVolUl(uL: number): string {
  if (uL >= 1000) return `${trim(uL / 1000)} mL`;
  return `${trim(uL)} µL`;
}

// Volumes (fmtVolUl) switch between µL/mL for readability, but
// concentrations stay in mg/mL throughout -- switching units mid-plan makes
// it harder to sanity-check at a glance (Dustin, 2026-08-25).
function fmtConcMgPerMl(mgPerMl: number): string {
  return `${trim(mgPerMl)} mg/mL`;
}

function trim(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return Number(n.toPrecision(4)).toString();
}

export interface DilutionInput {
  stock: { conc: number; massUnit: MassUnit; volUnit: VolUnit; availableVol: number; availableVolUnit: VolUnit };
  target: { conc: number; massUnit: MassUnit; volUnit: VolUnit; finalVol: number; finalVolUnit: VolUnit };
  diluentName: string;
  minPipetteUl: number;
  /**
   * "palette" restricts every transfer to a named ratio (1:1/1:5/1:10 and
   * their compositions) so no pipette setting ever changes mid-prep, at the
   * cost of not hitting the factor exactly. "free" is the old 5 uL grid
   * search, kept for the cases the palette cannot bring into range.
   */
  volumeMode?: "palette" | "free";
  maxSteps?: number;
}

export interface DilutionStep {
  fromLabel: string;
  aliquotDisplay: string;
  diluentDisplay: string;
  finalVolDisplay: string;
  resultConcDisplay: string;
  aliquotUl: number;
  finalVolUl: number;
  resultingMgPerMl: number;
  /** "1:10" when this transfer is a palette ratio, absent when it isn't. */
  ratioLabel?: string;
}

export interface DilutionResult {
  steps: DilutionStep[];
  procedure: string;
  dilutionFactor: number;
  serial: boolean;
  warnings: string[];
  error?: string;
  /** Per-transfer palette ratios, when the plan was built from them. */
  ratios?: number[];
}

export function computeDilution(input: DilutionInput): DilutionResult {
  const { stock, target, diluentName, minPipetteUl } = input;
  const c1 = concToMgPerMl(stock.conc, stock.massUnit, stock.volUnit);
  const c2 = concToMgPerMl(target.conc, target.massUnit, target.volUnit);
  const v2Ul = roundToVolumeGrid(target.finalVol * VOL_TO_UL[target.finalVolUnit]);
  const availableUl = stock.availableVol * VOL_TO_UL[stock.availableVolUnit];
  const warnings: string[] = [];

  if (c2 >= c1) {
    return {
      steps: [], procedure: "", dilutionFactor: 0, serial: false, warnings: [],
      error: "Desired concentration must be lower than stock concentration.",
    };
  }

  const df = c1 / c2;
  const singleAliquotUlExact = v2Ul / df;

  const paletteMode = input.volumeMode === "palette";

  if (!paletteMode && singleAliquotUlExact >= minPipetteUl) {
    const singleAliquotUl = roundToVolumeGrid(singleAliquotUlExact, minPipetteUl);
    const actualConc = c1 * (singleAliquotUl / v2Ul);
    if (singleAliquotUl > availableUl) {
      warnings.push(`Required aliquot (${fmtVolUl(singleAliquotUl)}) exceeds available stock (${fmtVolUl(availableUl)}).`);
    }
    const step = buildStep({
      fromLabel: "Stock",
      aliquotUl: singleAliquotUl,
      finalVolUl: v2Ul,
      resultingMgPerMl: actualConc,
      diluentName,
    });
    const actualDf = c1 / actualConc;
    return {
      steps: [step],
      procedure: renderProcedure([step], diluentName, minPipetteUl, actualDf, false),
      dilutionFactor: actualDf,
      serial: false,
      warnings,
    };
  }

  // Serial dilution. Every transfer stays at or above the pipette floor --
  // see bestChain, which enumerates the factors actually reachable on the
  // grid instead of demanding a whole-number total factor the way this used
  // to. A sample's factor is whatever its label mass and vial size make it,
  // so the old integer requirement rejected ordinary preps outright.
  if (v2Ul < minPipetteUl) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: `Final volume (${fmtVolUl(v2Ul)}) is smaller than the ${minPipetteUl} µL pipette minimum. Increase the desired volume.`,
    };
  }

  const chain = paletteMode
    ? bestRatioChain(df, v2Ul, minPipetteUl, input.maxSteps ?? 4)
    : bestChain(df, v2Ul, minPipetteUl, input.maxSteps ?? 4);
  if (!chain) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: paletteMode
        ? `Cannot reach ${trim(df)}× at final volume ${fmtVolUl(v2Ul)} from the standard ratios without pipetting under ${minPipetteUl} µL.`
        : `Cannot reach ${trim(df)}× at final volume ${fmtVolUl(v2Ul)} without pipetting under ${minPipetteUl} µL. Increase the final volume.`,
    };
  }
  const chainRatios = "ratios" in chain ? (chain as { ratios: number[] }).ratios : undefined;

  const firstAliquotUl = chain.aliquots[0];
  if (firstAliquotUl > availableUl) {
    warnings.push(`First aliquot (${fmtVolUl(firstAliquotUl)}) exceeds available stock (${fmtVolUl(availableUl)}).`);
  }

  const steps: DilutionStep[] = [];
  let prevConc = c1;
  let prevLabel = "Stock";
  for (let i = 0; i < chain.aliquots.length; i++) {
    const aliquotUl = chain.aliquots[i];
    const resulting = prevConc * (aliquotUl / v2Ul);
    const s = buildStep({
      fromLabel: prevLabel,
      aliquotUl,
      finalVolUl: v2Ul,
      resultingMgPerMl: resulting,
      diluentName,
      ratioLabel: chainRatios ? ratioName(chainRatios[i]) : undefined,
    });
    steps.push(s);
    prevConc = resulting;
    prevLabel = `Intermediate ${i + 1}`;
  }

  const actualDf = c1 / prevConc;
  return {
    steps,
    procedure: renderProcedure(steps, diluentName, minPipetteUl, actualDf, true,
      chain.aliquots.map((a) => v2Ul / a)),
    dilutionFactor: actualDf,
    serial: steps.length > 1,
    warnings,
    ratios: chainRatios,
  };
}


function buildStep(args: {
  fromLabel: string;
  aliquotUl: number;
  finalVolUl: number;
  resultingMgPerMl: number;
  diluentName: string;
  ratioLabel?: string;
}): DilutionStep {
  const diluentUl = Math.max(0, args.finalVolUl - args.aliquotUl);
  return {
    fromLabel: args.fromLabel,
    aliquotUl: args.aliquotUl,
    finalVolUl: args.finalVolUl,
    resultingMgPerMl: args.resultingMgPerMl,
    ratioLabel: args.ratioLabel,
    aliquotDisplay: fmtVolUl(args.aliquotUl),
    diluentDisplay: fmtVolUl(diluentUl),
    finalVolDisplay: fmtVolUl(args.finalVolUl),
    resultConcDisplay: fmtConcMgPerMl(args.resultingMgPerMl),
  };
}

function renderProcedure(
  steps: DilutionStep[],
  diluentName: string,
  minPipetteUl: number,
  df: number,
  serial: boolean,
  factors?: number[],
): string {
  const lines: string[] = [];
  lines.push(serial
    ? `Serial dilution — total factor ${trim(df)}× over ${steps.length} steps (${(factors ?? []).map(f => `${trim(f)}×`).join(" × ")}).`
    : `Single-step dilution — factor ${trim(df)}×.`);
  lines.push(`Minimum pipette volume: ${minPipetteUl} µL.`);
  lines.push("");
  steps.forEach((s, i) => {
    const label = serial && i < steps.length - 1 ? `Intermediate ${i + 1}` : "Final";
    lines.push(`${i + 1}. ${label}: pipette ${s.aliquotDisplay} of ${s.fromLabel} into ${s.diluentDisplay} of ${diluentName} → ${s.finalVolDisplay} at ${s.resultConcDisplay}.`);
  });
  return lines.join("\n");
}
/**
 * The ratios Dustin actually works in.
 *
 * 2026-08-31: "1:10 and 1:100 dilutions are great because humans can
 * understand them at a glance... When I make my own dilutions by hand they
 * are composed of these steps 100% of the time. And I can set 6 pipettors
 * permanently to those measurements so there is no stop to change and
 * recalibrate in between any steps."
 *
 * That last clause is the real constraint, and it is not one a free volume
 * grid can satisfy. A plan reading "65 then 95 then 135 µL" silently assumes
 * the pipette gets re-set three times; every one of those is an adjustment
 * that can be misread, mis-set, or drift.
 *
 * Only three ratios appear here. The other three Dustin named are these
 * composed: 1:25 is 1:5 twice, 1:50 is 1:5 then 1:10, 1:100 is 1:10 twice.
 * Realising them directly would need a 40, 20 or 10 µL aliquot at a 1 mL
 * working volume -- under the floor, and exactly the fine pipetting the
 * floor exists to prevent. Composed, every aliquot is 100 µL or more.
 *
 * A ratio is scale-free, so the aliquot is finalVolume/factor: at 1 mL these
 * are 500, 200 and 100 µL, and the matching diluent volumes are 500, 800 and
 * 900 -- six settings, six pipettors, nothing to change mid-prep.
 */
export const RATIO_PALETTE = [
  { factor: 2, label: "1:1" },
  { factor: 5, label: "1:5" },
  { factor: 10, label: "1:10" },
] as const;

/** Names a composed factor the way the bench says it, when it has a name. */
const COMPOSED_RATIO_NAMES: Record<number, string> = {
  2: "1:1", 5: "1:5", 10: "1:10", 25: "1:25", 50: "1:50", 100: "1:100",
};
export function ratioName(factor: number): string {
  return COMPOSED_RATIO_NAMES[factor] ?? `1:${trim(factor)}`;
}

/**
 * Like bestChain, but every transfer is one of the palette ratios.
 *
 * The achievable factors are the products of 2, 5 and 10, so the target is
 * generally NOT hit exactly -- worst case about 14% anywhere, 11% in the
 * 10-60x band real samples occupy. That miss is placement, not error: the
 * caller recomputes the concentration actually achieved and quantifies
 * against it. What is bought with it is that no pipette setting ever changes.
 *
 * Returns null when no combination lands within `maxSteps` transfers while
 * keeping every aliquot at or above the floor.
 */
export function bestRatioChain(
  targetDf: number, finalVolUl: number, minPipetteUl: number, maxSteps = 4,
): (DilutionChain & { ratios: number[] }) | null {
  if (!(targetDf > 0) || !(finalVolUl > 0)) return null;
  const usable = RATIO_PALETTE
    .filter(r => finalVolUl / r.factor >= minPipetteUl)
    .map(r => r.factor);
  if (!usable.length) return null;

  const err = (df: number) => Math.abs(Math.log(df / targetDf));
  const cap = Math.max(1, Math.min(Math.floor(maxSteps), 5));
  let best: (DilutionChain & { ratios: number[] }) | null = null;

  const consider = (ratios: number[]) => {
    const df = ratios.reduce((a, b) => a * b, 1);
    const aliquots = ratios.map(r => finalVolUl / r);
    if (aliquots.some(a => a < minPipetteUl)) return;
    const cand = { aliquots, achievedDf: df, ratios };
    if (!best) { best = cand; return; }
    const ea = err(df), eb = err(best.achievedDf);
    // Closest first; among equals the shorter chain, then the gentler one --
    // 1:5 twice strains each transfer less than 1:10 then 1:1 for the same
    // factor, and leaves the sample less concentrated at the halfway point.
    if (Math.abs(ea - eb) > 1e-12) { if (ea < eb) best = cand; return; }
    if (ratios.length !== best.ratios.length) {
      if (ratios.length < best.ratios.length) best = cand;
      return;
    }
    if (Math.max(...ratios) < Math.max(...best.ratios)) best = cand;
  };

  const walk = (prefix: number[]) => {
    if (prefix.length) consider(prefix);
    if (prefix.length >= cap) return;
    for (const f of usable) {
      // Non-decreasing keeps each multiset visited once; order of transfers
      // does not change the product.
      if (prefix.length && f < prefix[prefix.length - 1]) continue;
      walk([...prefix, f]);
    }
  };
  walk([]);
  return best;
}

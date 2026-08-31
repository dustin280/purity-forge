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
}

export interface DilutionResult {
  steps: DilutionStep[];
  procedure: string;
  dilutionFactor: number;
  serial: boolean;
  warnings: string[];
  error?: string;
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

  if (singleAliquotUlExact >= minPipetteUl) {
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

  const chain = bestChain(df, v2Ul, minPipetteUl);
  if (!chain) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: `Cannot reach ${trim(df)}× at final volume ${fmtVolUl(v2Ul)} without pipetting under ${minPipetteUl} µL. Increase the final volume.`,
    };
  }

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
    serial: true,
    warnings,
  };
}


function buildStep(args: {
  fromLabel: string;
  aliquotUl: number;
  finalVolUl: number;
  resultingMgPerMl: number;
  diluentName: string;
}): DilutionStep {
  const diluentUl = Math.max(0, args.finalVolUl - args.aliquotUl);
  return {
    fromLabel: args.fromLabel,
    aliquotUl: args.aliquotUl,
    finalVolUl: args.finalVolUl,
    resultingMgPerMl: args.resultingMgPerMl,
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
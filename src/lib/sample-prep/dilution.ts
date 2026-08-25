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
 * Electronic pipettors can only be set in practical increments of 0.05 mL
 * (50 µL) -- but that's a large-volume-scale constraint (diluent additions,
 * final volumes), not a real limit on small aliquots, which have their own
 * much finer practical resolution (a dedicated low-volume pipette). Below
 * COARSE_GRID_THRESHOLD_UL, round to the nearest 5 µL instead; at or above
 * it, use the 50 µL grid. Confirmed 2026-08-25: a 20 µL SUMMIT aliquot
 * forced onto the 50 µL grid unmodified would round up to 50 µL -- a 150%
 * distortion that pushed one blend compound's resulting concentration all
 * the way to its calibration ceiling -- but the fine grid still has to be
 * 5 µL, not 1 µL: this is high-precision quant work and ugly values (13 µL,
 * 0.47 mL) are themselves a problem Dustin needs to avoid at a glance, on
 * top of not being reliably pipettable below the lab's real absolute
 * minimum. Rounding shifts the achieved concentration slightly off the
 * theoretical target either way; callers recompute the real resulting
 * concentration from the rounded volume rather than reporting the
 * pre-rounding theoretical one.
 */
const FINE_GRID_UL = 5;
const COARSE_GRID_UL = 50;
const COARSE_GRID_THRESHOLD_UL = 200;

function gridFor(uL: number): number {
  return uL < COARSE_GRID_THRESHOLD_UL ? FINE_GRID_UL : COARSE_GRID_UL;
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

  // Serial dilution: every per-step factor must be a whole integer >= 2.
  // Cap per-step factor by maxStepDf so aliquot stays >= minPipetteUl at v2Ul.
  const maxStepDf = Math.floor(v2Ul / minPipetteUl);
  if (maxStepDf < 2) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: `Final volume (${fmtVolUl(v2Ul)}) is too small to pipette ${minPipetteUl} µL. Increase the desired volume.`,
    };
  }

  const dfRounded = Math.round(df);
  if (Math.abs(df - dfRounded) > 1e-6 || dfRounded < 2) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: `Serial dilution requires a whole-number total dilution factor. Adjust target concentration or volume so C1/C2 is an integer (currently ${trim(df)}×).`,
    };
  }

  const factors = factorize(dfRounded, maxStepDf, 6);
  if (!factors) {
    return {
      steps: [], procedure: "", dilutionFactor: df, serial: false, warnings: [],
      error: `Cannot build a whole-number serial dilution for factor ${dfRounded}× at final volume ${fmtVolUl(v2Ul)}. Increase the final volume or adjust the target.`,
    };
  }

  // Grid-round every step's aliquot to the same volume where the factor
  // repeats (e.g. 10x10) so consecutive steps use the same pipette setting
  // -- minimizes pipette volume changes across the plan, not just per-step.
  const aliquotByFactor = new Map<number, number>();
  for (const k of factors) {
    if (!aliquotByFactor.has(k)) aliquotByFactor.set(k, roundToVolumeGrid(v2Ul / k, minPipetteUl));
  }

  const firstAliquotUl = aliquotByFactor.get(factors[0]) ?? roundToVolumeGrid(v2Ul / factors[0], minPipetteUl);
  if (firstAliquotUl > availableUl) {
    warnings.push(`First aliquot (${fmtVolUl(firstAliquotUl)}) exceeds available stock (${fmtVolUl(availableUl)}).`);
  }

  const steps: DilutionStep[] = [];
  let prevConc = c1;
  let prevLabel = "Stock";
  for (let i = 0; i < factors.length; i++) {
    const k = factors[i];
    const aliquotUl = aliquotByFactor.get(k) as number;
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
    procedure: renderProcedure(steps, diluentName, minPipetteUl, actualDf, true, factors),
    dilutionFactor: actualDf,
    serial: true,
    warnings,
  };
}

/**
 * Decompose `total` into an ordered list of integer factors, each in [2, maxStep],
 * whose product equals `total`. Prefers 10× intermediates when 10 divides the
 * remainder and fits in maxStep. Returns null if no decomposition of length <= maxSteps exists.
 */
function factorize(total: number, maxStep: number, maxSteps: number): number[] | null {
  if (total <= maxStep) return [total];
  const factors: number[] = [];
  let remaining = total;
  while (remaining > maxStep) {
    if (factors.length >= maxSteps - 1) return null;
    let k = 0;
    if (maxStep >= 10 && remaining % 10 === 0) {
      k = 10;
    } else {
      for (let cand = maxStep; cand >= 2; cand--) {
        if (remaining % cand === 0) { k = cand; break; }
      }
    }
    if (!k) return null;
    factors.push(k);
    remaining = remaining / k;
  }
  if (remaining < 2) return null;
  factors.push(remaining);
  return factors;
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
    ? `Serial dilution — total factor ${trim(df)}× over ${steps.length} steps (${(factors ?? []).map(f => `${f}×`).join(" × ")}).`
    : `Single-step dilution — factor ${trim(df)}×.`);
  lines.push(`Minimum pipette volume: ${minPipetteUl} µL.`);
  lines.push("");
  steps.forEach((s, i) => {
    const label = serial && i < steps.length - 1 ? `Intermediate ${i + 1}` : "Final";
    lines.push(`${i + 1}. ${label}: pipette ${s.aliquotDisplay} of ${s.fromLabel} into ${s.diluentDisplay} of ${diluentName} → ${s.finalVolDisplay} at ${s.resultConcDisplay}.`);
  });
  return lines.join("\n");
}
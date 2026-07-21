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

function fmtConcMgPerMl(mgPerMl: number): string {
  if (mgPerMl >= 1) return `${trim(mgPerMl)} mg/mL`;
  if (mgPerMl >= 0.001) return `${trim(mgPerMl * 1000)} µg/mL`;
  return `${trim(mgPerMl * 1_000_000)} ng/mL`;
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
  const v2Ul = target.finalVol * VOL_TO_UL[target.finalVolUnit];
  const availableUl = stock.availableVol * VOL_TO_UL[stock.availableVolUnit];
  const warnings: string[] = [];

  if (c2 >= c1) {
    return {
      steps: [], procedure: "", dilutionFactor: 0, serial: false, warnings: [],
      error: "Desired concentration must be lower than stock concentration.",
    };
  }

  const df = c1 / c2;
  const singleAliquotUl = v2Ul / df;

  if (singleAliquotUl >= minPipetteUl) {
    if (singleAliquotUl > availableUl) {
      warnings.push(`Required aliquot (${fmtVolUl(singleAliquotUl)}) exceeds available stock (${fmtVolUl(availableUl)}).`);
    }
    const step = buildStep({
      fromLabel: "Stock",
      aliquotUl: singleAliquotUl,
      finalVolUl: v2Ul,
      resultingMgPerMl: c2,
      diluentName,
    });
    return {
      steps: [step],
      procedure: renderProcedure([step], diluentName, minPipetteUl, df, false),
      dilutionFactor: df,
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

  const firstAliquotUl = v2Ul / factors[0];
  if (firstAliquotUl > availableUl) {
    warnings.push(`First aliquot (${fmtVolUl(firstAliquotUl)}) exceeds available stock (${fmtVolUl(availableUl)}).`);
  }

  const steps: DilutionStep[] = [];
  let prevConc = c1;
  let prevLabel = "Stock";
  for (let i = 0; i < factors.length; i++) {
    const k = factors[i];
    const resulting = prevConc / k;
    const s = buildStep({
      fromLabel: prevLabel,
      aliquotUl: v2Ul / k,
      finalVolUl: v2Ul,
      resultingMgPerMl: resulting,
      diluentName,
    });
    steps.push(s);
    prevConc = resulting;
    prevLabel = `Intermediate ${i + 1}`;
  }

  return {
    steps,
    procedure: renderProcedure(steps, diluentName, minPipetteUl, df, true, factors),
    dilutionFactor: df,
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
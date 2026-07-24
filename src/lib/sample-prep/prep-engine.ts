/**
 * Pure preparation planner for the Sample Prep wizard.
 * Takes an approved method revision's prep rules plus a sample context and
 * target level, and produces a deterministic list of bench steps
 * (reconstitute → optional serial dilutions → aliquot) with warnings.
 * No I/O; safe to import from both client and server.
 */
import { computeDilution, type MassUnit, type VolUnit } from "./dilution";

export interface PrepPlanInput {
  analyteName: string;
  source: {
    form: "lyophilized" | "solution";
    /** Mass on hand for lyophilized source (mg). */
    availableMassMg?: number | null;
    /** Purity as a fraction (0..1). Optional; defaults to 1. */
    purityFraction?: number | null;
    /** For solution sources: current concentration (mg/mL). */
    stockConcentrationMgPerMl?: number | null;
    /** For solution sources: volume on hand (µL). */
    availableVolumeUl?: number | null;
  };
  reconstitution: {
    /** Requested volume of diluent to reconstitute a lyophilized sample (µL). */
    volumeUl?: number | null;
    solventName: string;
  };
  target: {
    concentrationMgPerMl: number;
    finalVolumeUl: number;
    calibrationLevel?: number | null;
  };
  rules: {
    absoluteMinPipetteUl: number;
    preferredMinPipetteUl: number;
    maxPipetteUl?: number | null;
    maxDilutionSteps: number;
    preferredFinalVolumeUl?: number | null;
    minInitialReconstitutionUl?: number | null;
    maxInitialReconstitutionUl?: number | null;
    preferredInitialReconstitutionUl?: number | null;
  };
  calibration?: {
    minMgPerMl?: number | null;
    maxMgPerMl?: number | null;
  };
  vessels?: Array<{
    id: string;
    name: string;
    nominalCapacityUl: number;
    minWorkingUl?: number | null;
    maxWorkingUl?: number | null;
  }>;
  equipment?: Array<{
    id: string;
    label: string;
    equipmentType: string;
    minCapacity?: number | null;
    maxCapacity?: number | null;
    capacityUnit?: string | null;
  }>;
}

export type PlanStepKind = "reconstitute" | "dilute" | "aliquot";

export interface PlanStep {
  kind: PlanStepKind;
  ordinal: number;
  fromLabel: string;
  toLabel: string;
  instruction: string;
  aliquotUl?: number;
  diluentUl?: number;
  finalVolumeUl?: number;
  resultingMgPerMl?: number;
  suggestedVesselId?: string | null;
  suggestedEquipmentId?: string | null;
}

export type WarningCode =
  | "below-preferred-pipette"
  | "below-absolute-pipette"
  | "exceeds-max-steps"
  | "outside-vessel-working-volume"
  | "target-outside-calibration-range"
  | "insufficient-source"
  | "reconstitution-outside-rule"
  | "invalid-input";

export interface PlanWarning {
  code: WarningCode;
  message: string;
}

export interface PrepPlan {
  ok: boolean;
  steps: PlanStep[];
  warnings: PlanWarning[];
  stockConcentrationMgPerMl: number | null;
  totalDilutionFactor: number | null;
  targetConcentrationMgPerMl: number;
  finalVolumeUl: number;
  error?: string;
}

function pickVessel(volumeUl: number, vessels?: PrepPlanInput["vessels"]): string | null {
  if (!vessels?.length) return null;
  const candidates = vessels
    .filter(v => {
      const min = v.minWorkingUl ?? 0;
      const max = v.maxWorkingUl ?? v.nominalCapacityUl;
      return volumeUl >= min && volumeUl <= max;
    })
    .sort((a, b) => a.nominalCapacityUl - b.nominalCapacityUl);
  return candidates[0]?.id ?? null;
}

function pickPipette(aliquotUl: number, equipment?: PrepPlanInput["equipment"]): string | null {
  if (!equipment?.length) return null;
  const pipettes = equipment.filter(e => /pipette/i.test(e.equipmentType));
  const inRange = pipettes
    .filter(p => {
      const min = p.minCapacity ?? 0;
      const max = p.maxCapacity ?? Infinity;
      const unit = (p.capacityUnit ?? "µL").toLowerCase();
      const scale = unit.includes("ml") ? 1000 : 1;
      return aliquotUl >= min * scale && aliquotUl <= max * scale;
    })
    .sort((a, b) => (a.maxCapacity ?? 0) - (b.maxCapacity ?? 0));
  return inRange[0]?.id ?? null;
}

function fmtVol(uL: number): string {
  if (uL >= 1000) return `${(uL / 1000).toFixed(uL % 1000 === 0 ? 0 : 2)} mL`;
  return `${uL.toFixed(uL < 10 ? 2 : 1)} µL`;
}

function fmtConc(mgPerMl: number): string {
  if (mgPerMl >= 1) return `${mgPerMl.toPrecision(4)} mg/mL`;
  if (mgPerMl >= 0.001) return `${(mgPerMl * 1000).toPrecision(4)} µg/mL`;
  return `${(mgPerMl * 1_000_000).toPrecision(4)} ng/mL`;
}

export function planPreparation(input: PrepPlanInput): PrepPlan {
  const warnings: PlanWarning[] = [];
  const steps: PlanStep[] = [];

  if (!(input.target.concentrationMgPerMl > 0) || !(input.target.finalVolumeUl > 0)) {
    return {
      ok: false, steps: [], warnings: [{ code: "invalid-input", message: "Target concentration and final volume must be > 0." }],
      stockConcentrationMgPerMl: null, totalDilutionFactor: null,
      targetConcentrationMgPerMl: input.target.concentrationMgPerMl,
      finalVolumeUl: input.target.finalVolumeUl,
      error: "Invalid target",
    };
  }

  // Determine stock concentration.
  let stockMgPerMl: number | null = null;
  let stockLabel = "Stock";
  const purity = input.source.purityFraction ?? 1;

  if (input.source.form === "lyophilized") {
    const mass = input.source.availableMassMg ?? 0;
    const vol = input.reconstitution.volumeUl ?? input.rules.preferredInitialReconstitutionUl ?? 0;
    if (mass <= 0 || vol <= 0) {
      return {
        ok: false, steps: [], warnings: [{ code: "invalid-input", message: "Provide available mass and reconstitution volume." }],
        stockConcentrationMgPerMl: null, totalDilutionFactor: null,
        targetConcentrationMgPerMl: input.target.concentrationMgPerMl,
        finalVolumeUl: input.target.finalVolumeUl,
        error: "Missing reconstitution",
      };
    }
    if (
      (input.rules.minInitialReconstitutionUl != null && vol < input.rules.minInitialReconstitutionUl) ||
      (input.rules.maxInitialReconstitutionUl != null && vol > input.rules.maxInitialReconstitutionUl)
    ) {
      warnings.push({
        code: "reconstitution-outside-rule",
        message: `Reconstitution volume ${fmtVol(vol)} outside method rule ${input.rules.minInitialReconstitutionUl ?? "?"}–${input.rules.maxInitialReconstitutionUl ?? "?"} µL.`,
      });
    }
    stockMgPerMl = (mass * purity) / (vol / 1000);
    stockLabel = "Reconstituted stock";
    steps.push({
      kind: "reconstitute",
      ordinal: 1,
      fromLabel: input.analyteName,
      toLabel: stockLabel,
      instruction: `Dissolve ${mass} mg of ${input.analyteName}${purity < 1 ? ` (purity ${(purity * 100).toFixed(1)}%)` : ""} in ${fmtVol(vol)} of ${input.reconstitution.solventName} → ${fmtConc(stockMgPerMl)}.`,
      finalVolumeUl: vol,
      resultingMgPerMl: stockMgPerMl,
      diluentUl: vol,
      suggestedVesselId: pickVessel(vol, input.vessels),
    });
  } else {
    stockMgPerMl = input.source.stockConcentrationMgPerMl ?? 0;
    if (stockMgPerMl <= 0) {
      return {
        ok: false, steps: [], warnings: [{ code: "invalid-input", message: "Provide stock concentration for the solution." }],
        stockConcentrationMgPerMl: null, totalDilutionFactor: null,
        targetConcentrationMgPerMl: input.target.concentrationMgPerMl,
        finalVolumeUl: input.target.finalVolumeUl,
        error: "Missing stock concentration",
      };
    }
  }

  const target = input.target.concentrationMgPerMl;
  if (target >= stockMgPerMl) {
    return {
      ok: false, steps, warnings,
      stockConcentrationMgPerMl: stockMgPerMl,
      totalDilutionFactor: null,
      targetConcentrationMgPerMl: target,
      finalVolumeUl: input.target.finalVolumeUl,
      error: `Target concentration (${fmtConc(target)}) is not lower than stock (${fmtConc(stockMgPerMl)}). Increase reconstitution volume or lower the target.`,
    };
  }

  // Calibration range check.
  if (input.calibration) {
    const { minMgPerMl, maxMgPerMl } = input.calibration;
    if ((minMgPerMl != null && target < minMgPerMl) || (maxMgPerMl != null && target > maxMgPerMl)) {
      warnings.push({
        code: "target-outside-calibration-range",
        message: `Target ${fmtConc(target)} is outside the calibration range (${minMgPerMl != null ? fmtConc(minMgPerMl) : "—"} to ${maxMgPerMl != null ? fmtConc(maxMgPerMl) : "—"}).`,
      });
    }
  }

  // Delegate the dilution chain to the existing calculator.
  const minPipette = Math.max(1, input.rules.absoluteMinPipetteUl);
  const targetV2Ul = input.target.finalVolumeUl;
  const stockUnit: { mass: MassUnit; vol: VolUnit } = { mass: "mg", vol: "mL" };
  const dr = computeDilution({
    stock: {
      conc: stockMgPerMl,
      massUnit: stockUnit.mass,
      volUnit: stockUnit.vol,
      availableVol: input.source.availableVolumeUl ?? (input.reconstitution.volumeUl ?? 1_000_000),
      availableVolUnit: "uL",
    },
    target: {
      conc: target,
      massUnit: "mg",
      volUnit: "mL",
      finalVol: targetV2Ul,
      finalVolUnit: "uL",
    },
    diluentName: input.reconstitution.solventName,
    minPipetteUl: minPipette,
  });

  if (dr.error) {
    return {
      ok: false, steps, warnings,
      stockConcentrationMgPerMl: stockMgPerMl,
      totalDilutionFactor: dr.dilutionFactor || null,
      targetConcentrationMgPerMl: target,
      finalVolumeUl: targetV2Ul,
      error: dr.error,
    };
  }

  if (dr.steps.length > input.rules.maxDilutionSteps) {
    warnings.push({
      code: "exceeds-max-steps",
      message: `Plan uses ${dr.steps.length} dilution steps; method limit is ${input.rules.maxDilutionSteps}.`,
    });
  }

  let prevLabel = stockLabel;
  dr.steps.forEach((s, i) => {
    const isFinal = i === dr.steps.length - 1;
    const toLabel = isFinal ? "Working standard" : `Intermediate ${i + 1}`;
    steps.push({
      kind: isFinal && dr.steps.length === 1 ? "dilute" : "dilute",
      ordinal: steps.length + 1,
      fromLabel: prevLabel,
      toLabel,
      instruction: `Pipette ${s.aliquotDisplay} of ${prevLabel} into ${s.diluentDisplay} of ${input.reconstitution.solventName} → ${s.finalVolDisplay} at ${s.resultConcDisplay}.`,
      aliquotUl: s.aliquotUl,
      diluentUl: s.finalVolUl - s.aliquotUl,
      finalVolumeUl: s.finalVolUl,
      resultingMgPerMl: s.resultingMgPerMl,
      suggestedVesselId: pickVessel(s.finalVolUl, input.vessels),
      suggestedEquipmentId: pickPipette(s.aliquotUl, input.equipment),
    });
    if (s.aliquotUl < input.rules.preferredMinPipetteUl) {
      warnings.push({
        code: s.aliquotUl < minPipette ? "below-absolute-pipette" : "below-preferred-pipette",
        message: `Aliquot ${fmtVol(s.aliquotUl)} is below preferred minimum ${input.rules.preferredMinPipetteUl} µL.`,
      });
    }
    if (input.rules.maxPipetteUl != null && s.aliquotUl > input.rules.maxPipetteUl) {
      warnings.push({
        code: "below-preferred-pipette",
        message: `Aliquot ${fmtVol(s.aliquotUl)} exceeds preferred maximum ${input.rules.maxPipetteUl} µL.`,
      });
    }
    prevLabel = toLabel;
  });

  // Source sufficiency for solution stocks.
  if (input.source.form === "solution" && input.source.availableVolumeUl != null && dr.steps[0]) {
    if (dr.steps[0].aliquotUl > input.source.availableVolumeUl) {
      warnings.push({
        code: "insufficient-source",
        message: `First aliquot ${fmtVol(dr.steps[0].aliquotUl)} exceeds available stock ${fmtVol(input.source.availableVolumeUl)}.`,
      });
    }
  }

  return {
    ok: true,
    steps,
    warnings,
    stockConcentrationMgPerMl: stockMgPerMl,
    totalDilutionFactor: dr.dilutionFactor,
    targetConcentrationMgPerMl: target,
    finalVolumeUl: targetV2Ul,
  };
}

export function formatVolume(uL: number): string { return fmtVol(uL); }
export function formatConcentration(mgPerMl: number): string { return fmtConc(mgPerMl); }
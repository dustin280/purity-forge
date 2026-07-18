import type { SolidFlowState } from "./types";
import { toMgPerMl } from "./types";

export interface ComputedPrep {
  mass_mg: number;
  target_conc_mg_per_ml: number;
  final_volume_ml: number;
  solvent_ml: Array<{ name: string; ml: number }>;
  modifier_ml: number | null;
  instructions: string;
}

/**
 * Build the human-readable prep instructions plus the underlying numbers used
 * when writing the log row and rendering the review card. Returns null if
 * required inputs are missing or invalid.
 */
export function computePrep(state: SolidFlowState): ComputedPrep | null {
  const src = state.source;
  const c = state.concentration;
  const finalVol = Number(c.final_volume_ml);
  const finalConc = Number(c.final_concentration);
  if (!src || !finalVol || !finalConc || finalVol <= 0 || finalConc <= 0) return null;

  const activeSolvents = state.diluent.filter(s => s.name && Number(s.percent) > 0);
  if (activeSolvents.length === 0) return null;
  const sumPct = activeSolvents.reduce((s, x) => s + Number(x.percent || 0), 0);
  if (Math.abs(sumPct - 100) > 0.01) return null;

  const targetMgMl = toMgPerMl(finalConc, c.final_concentration_unit);
  const purity = src.purity_percent && src.purity_percent > 0 ? src.purity_percent : 100;
  const massMg = (targetMgMl * finalVol) / (purity / 100);

  const solventMl = activeSolvents.map(s => ({
    name: s.name,
    ml: (Number(s.percent) / 100) * finalVol,
  }));

  const modType = state.modifier.type.trim();
  const modPct = Number(state.modifier.percent);
  const modMl = modType && modPct > 0 ? (modPct / 100) * finalVol : null;

  const partialVol = finalVol * 0.8;
  const solventListStr = solventMl
    .map(s => `${fmt(s.ml)} mL ${s.name}`)
    .join(" + ");

  const balanceG = (massMg / 1000).toFixed(4);
  const lines: string[] = [];
  lines.push(
    `1. Weigh ${fmt(massMg)} mg (balance reading: ${balanceG} g) of ${src.material_name}` +
    (src.lot ? ` (Lot ${src.lot})` : "") +
    (purity < 100 ? ` [correcting for ${purity}% purity]` : "") +
    ` into a ${fmt(finalVol)} mL volumetric flask.`,
  );
  lines.push(`2. Add ~${fmt(partialVol)} mL of diluent: ${solventListStr}.`);
  if (modMl != null && modType) {
    const modDisplayMl = modMl < 1 ? `${fmt(modMl * 1000)} µL` : `${fmt(modMl)} mL`;
    lines.push(`3. Add ${modDisplayMl} ${modType} (${fmt(modPct)}% of ${fmt(finalVol)} mL).`);
    lines.push(`4. Sonicate/mix until fully dissolved.`);
    lines.push(`5. Bring to final volume (${fmt(finalVol)} mL) with diluent. Invert to mix.`);
    lines.push(`6. Label as {STDLOG_YYYYMMDD_N} (assigned on save) and store at ${state.concentration.storage_condition || "specified conditions"}.`);
  } else {
    lines.push(`3. Sonicate/mix until fully dissolved.`);
    lines.push(`4. Bring to final volume (${fmt(finalVol)} mL) with diluent. Invert to mix.`);
    lines.push(`5. Label as {STDLOG_YYYYMMDD_N} (assigned on save) and store at ${state.concentration.storage_condition || "specified conditions"}.`);
  }

  return {
    mass_mg: massMg,
    target_conc_mg_per_ml: targetMgMl,
    final_volume_ml: finalVol,
    solvent_ml: solventMl,
    modifier_ml: modMl,
    instructions: lines.join("\n"),
  };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toPrecision(3);
}

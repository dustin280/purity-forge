/**
 * Pure preparation-text builder for Mobile Phase Prep Logs. Used by both the
 * form preview and the server insert path so the saved "Preparation" text is
 * deterministic.
 */
export type PrepSide = {
  enabled: boolean;
  solvent: string;
  solvent_pct: number;
  modifier: string | null;
  modifier_pct: number;
  diluent: string;
  notes?: string | null;
};

export type PrepRecordInput = {
  log_number?: string;
  lot_number: string;
  prepared_at: string; // ISO date
  user_initials: string;
  user_name: string;
  total_volume: number;
  total_volume_unit: "mL" | "L";
  prep_a: PrepSide;
  prep_b: PrepSide;
};

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(digits);
}

function buildSide(label: "A" | "B", side: PrepSide, totalMl: number): string[] {
  if (!side.enabled) return [];
  const solventVol = (totalMl * (side.solvent_pct || 0)) / 100;
  const modifierVol = (totalMl * (side.modifier_pct || 0)) / 100;
  const diluentVol = totalMl - solventVol - modifierVol;

  const lines: string[] = [];
  lines.push(`Mobile Phase ${label} — Total volume: ${fmt(totalMl)} mL`);

  let step = 1;
  // Diluent first (largest volume, into graduated cylinder)
  if (diluentVol > 0.01 && side.diluent && side.diluent !== side.solvent) {
    lines.push(`  ${step}. Measure ${fmt(diluentVol)} mL ${side.diluent} (${fmt(100 - side.solvent_pct - side.modifier_pct)}%) into a clean graduated cylinder.`);
    step++;
    lines.push(`  ${step}. Add ${fmt(solventVol)} mL ${side.solvent} (${fmt(side.solvent_pct)}%).`);
    step++;
  } else {
    // Single solvent (or diluent == solvent)
    const combined = solventVol + (side.diluent === side.solvent ? diluentVol : 0);
    const combinedPct = side.solvent_pct + (side.diluent === side.solvent ? 100 - side.solvent_pct - side.modifier_pct : 0);
    lines.push(`  ${step}. Measure ${fmt(combined)} mL ${side.solvent} (${fmt(combinedPct)}%) into a clean graduated cylinder.`);
    step++;
  }

  if (side.modifier && side.modifier_pct > 0) {
    lines.push(`  ${step}. Add ${fmt(modifierVol, 2)} mL ${side.modifier} (${fmt(side.modifier_pct, 2)}%).`);
    step++;
  }

  lines.push(`  ${step}. Mix thoroughly. Degas before use.`);
  if (side.notes && side.notes.trim()) {
    lines.push(`  Notes: ${side.notes.trim()}`);
  }
  return lines;
}

export function buildPreparation(rec: PrepRecordInput): string {
  const totalMl = rec.total_volume_unit === "L" ? rec.total_volume * 1000 : rec.total_volume;
  const sections: string[] = [];
  const a = buildSide("A", rec.prep_a, totalMl);
  const b = buildSide("B", rec.prep_b, totalMl);
  if (a.length) sections.push(a.join("\n"));
  if (b.length) sections.push(b.join("\n"));

  const date = rec.prepared_at.slice(0, 10);
  const footer = `Lot: ${rec.lot_number}  |  Prepared: ${date} by ${rec.user_initials}${rec.log_number ? `  |  ${rec.log_number}` : ""}`;
  sections.push(footer);
  return sections.join("\n\n");
}

export function validateSide(side: PrepSide): string | null {
  if (!side.enabled) return null;
  if (!side.solvent) return "Solvent is required";
  if (side.solvent_pct < 0 || side.solvent_pct > 100) return "Solvent % must be between 0 and 100";
  if (side.modifier && (side.modifier_pct < 0 || side.modifier_pct > 100)) return "Modifier % must be between 0 and 100";
  if (side.solvent_pct + side.modifier_pct > 100) return "Solvent % + Modifier % cannot exceed 100";
  if (!side.diluent) return "Diluent is required";
  return null;
}
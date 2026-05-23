/**
 * Pure derivations for the Standard Preparation form. Kept separate from
 * `use-prep-form.ts` so the hook stays focused on state + side effects.
 */
import { addDaysISO, calcMassMg, periodDays, type PrepFormValues } from "./prep-form-logic";

export type CalcRow = {
  idx: number;
  name: string;
  conc: number | null;
  vol: number | null;
  mass: number | null;
};

export function deriveComputedExpiration(v: PrepFormValues): string {
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  return days != null && v.prepared_at ? addDaysISO(v.prepared_at, days) : "";
}

export function deriveCalcRows(v: PrepFormValues): CalcRow[] {
  const purityNum = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  return v.targets.map((t, i) => {
    const conc = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
    const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
    const mass = conc != null && vol != null ? calcMassMg(conc, vol, purityNum) : null;
    return { idx: i + 1, name: t.name, conc, vol, mass };
  });
}

export function deriveShelfLifeWarning(v: PrepFormValues, computedExpiration: string): string | null {
  if (!v.ref_receipt_date || !v.ref_shelf_life_months) return null;
  const recd = new Date(v.ref_receipt_date);
  const shelfMonths = Number(v.ref_shelf_life_months);
  if (!Number.isFinite(shelfMonths) || shelfMonths <= 0) return null;
  const shelfEnd = new Date(recd);
  shelfEnd.setMonth(shelfEnd.getMonth() + shelfMonths);
  const today = new Date();
  const exp = computedExpiration ? new Date(computedExpiration) : null;
  const endStr = shelfEnd.toISOString().slice(0, 10);
  if (exp && exp > shelfEnd) return `Standard would expire (${computedExpiration}) after material shelf life (${endStr}).`;
  if (today > shelfEnd) return `Reference material is past its shelf life (${endStr}).`;
  return null;
}

export function deriveProcedureText(v: PrepFormValues, calcRows: CalcRow[], computedExpiration: string): string {
  const lines: string[] = [];
  lines.push(`1. Reference Material: ${v.ref_material_name || "—"} (Lot ${v.ref_lot || "—"}, Received ${v.ref_receipt_date || "—"}, Purity ${v.ref_purity_percent || "—"}%).`);
  let n = 2;
  calcRows.filter(r => r.mass != null && r.vol != null).forEach(r => {
    lines.push(`${n++}. For ${r.name || `Std #${r.idx}`}: accurately weigh ${r.mass!.toFixed(4)} mg of reference material.`);
    if (v.initial_solvent) lines.push(`${n++}. Dissolve in ${v.initial_solvent}${v.modifier_percent ? ` with ${v.modifier_percent}% modifier` : ""}.`);
    lines.push(`${n++}. Dilute to ${r.vol} mL with ${v.final_diluent || "final diluent"}.`);
  });
  if (computedExpiration) lines.push(`${n++}. Standard expires on ${computedExpiration}.`);
  return lines.join("\n");
}

export function deriveSummaryText(v: PrepFormValues, computedExpiration: string, targetCount: number): string {
  return [
    `Reference: ${v.ref_material_name || "—"} (Lot ${v.ref_lot || "—"})`,
    `Receipt date: ${v.ref_receipt_date || "—"}`,
    `Prepared: ${v.prepared_at} by ${v.analyst_name}`,
    `Expiration: ${computedExpiration || v.expiration_date || "—"}`,
    `Targets: ${targetCount}`,
  ].join("\n");
}
import type { PrepStep, PrepTarget } from "@/lib/standard-preparations.functions";

export type ExpirationCode = "1w" | "2w" | "4w" | "3m" | "6m" | "custom";

export type RefForm = "solid" | "liquid";

export interface TargetRow {
  name: string;
  target_concentration_mg_per_ml: string;
  target_volume_ml: string;
  notes: string;
}

export interface PrepFormValues {
  prepared_at: string;
  analyst_name: string;
  standard_name: string;
  material_receipt_id: string;
  material_receipt_label: string;
  manufacturer_lot: string;
  target_concentration: string;
  final_volume: string;
  solvent: string;
  preparation_steps: PrepStep[];
  mixing_details: string;
  appearance_notes: string;
  expiration_date: string;
  storage_condition: string;
  storage_location: string;
  container_label: string;
  notes: string;
  expiration_period_code: ExpirationCode;
  expiration_period_days: string;
  initial_solvent: string;
  final_diluent: string;
  modifier_percent: string;
  material_overridden: boolean;
  ref_material_name: string;
  ref_lot: string;
  ref_form: RefForm;
  ref_purity_percent: string;
  ref_concentration_mg_per_ml: string;
  ref_molecular_weight: string;
  ref_receipt_date: string;
  ref_shelf_life_months: string;
  targets: TargetRow[];
}

export const EXP_PRESETS: Record<Exclude<ExpirationCode, "custom">, { label: string; days: number }> = {
  "1w": { label: "1 week", days: 7 },
  "2w": { label: "2 weeks", days: 14 },
  "4w": { label: "4 weeks", days: 28 },
  "3m": { label: "3 months", days: 90 },
  "6m": { label: "6 months", days: 180 },
};

export function emptyTarget(): TargetRow {
  return { name: "", target_concentration_mg_per_ml: "", target_volume_ml: "", notes: "" };
}

export function periodDays(code: ExpirationCode, customDays: string): number | null {
  if (code === "custom") {
    const n = Number(customDays);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return EXP_PRESETS[code].days;
}

export function addDaysISO(dateInput: string, days: number): string {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function calcMassMg(concMgPerMl: number, volMl: number, purityPct: number | null): number {
  const raw = concMgPerMl * volMl;
  if (!purityPct || purityPct <= 0) return raw;
  return raw / (purityPct / 100);
}

/**
 * For liquid primary standards: volume of stock (mL) required to obtain
 * `targetConc * targetVol` mg of analyte.
 */
export function calcStockVolMl(targetConcMgPerMl: number, targetVolMl: number, stockConcMgPerMl: number | null): number | null {
  if (!stockConcMgPerMl || stockConcMgPerMl <= 0) return null;
  return (targetConcMgPerMl * targetVolMl) / stockConcMgPerMl;
}

export function emptyPrepValues(analystName: string): PrepFormValues {
  return {
    prepared_at: new Date().toISOString().slice(0, 16),
    analyst_name: analystName,
    standard_name: "",
    material_receipt_id: "",
    material_receipt_label: "",
    manufacturer_lot: "",
    target_concentration: "",
    final_volume: "",
    solvent: "",
    preparation_steps: [{ step_no: 1, description: "", amount: "", instrument_id: "", time: "" }],
    mixing_details: "",
    appearance_notes: "",
    expiration_date: "",
    storage_condition: "",
    storage_location: "",
    container_label: "",
    notes: "",
    expiration_period_code: "2w",
    expiration_period_days: "14",
    initial_solvent: "",
    final_diluent: "HPLC Grade Water + 0.1% TFA",
    modifier_percent: "",
    material_overridden: false,
    ref_material_name: "",
    ref_lot: "",
    ref_form: "solid",
    ref_purity_percent: "",
    ref_concentration_mg_per_ml: "",
    ref_molecular_weight: "",
    ref_receipt_date: "",
    ref_shelf_life_months: "",
    targets: [emptyTarget()],
  };
}

export function prepValuesToPayload(v: PrepFormValues) {
  const purity = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  const stockConc = v.ref_concentration_mg_per_ml === "" ? null : Number(v.ref_concentration_mg_per_ml);
  const isLiquid = v.ref_form === "liquid";
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  const expDate = days != null && v.prepared_at ? addDaysISO(v.prepared_at, days) : v.expiration_date || null;
  const targets: PrepTarget[] = v.targets
    .map((t, idx) => {
      const conc = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
      const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
      const mass = !isLiquid && conc != null && vol != null ? calcMassMg(conc, vol, purity) : null;
      const stockVol = isLiquid && conc != null && vol != null ? calcStockVolMl(conc, vol, stockConc) : null;
      return {
        row_no: idx + 1,
        name: t.name,
        target_concentration_mg_per_ml: conc,
        target_volume_ml: vol,
        calculated_mass_mg: mass,
        calculated_volume_ml: isLiquid ? stockVol : vol,
        notes: t.notes,
      };
    })
    .filter(t => t.name.trim() || t.target_concentration_mg_per_ml != null || t.target_volume_ml != null || t.notes.trim());

  return {
    prepared_at: new Date(v.prepared_at).toISOString(),
    analyst_name: v.analyst_name,
    standard_name: v.standard_name,
    material_receipt_id: v.material_receipt_id || null,
    manufacturer_lot: v.manufacturer_lot,
    target_concentration: v.target_concentration,
    final_volume: v.final_volume,
    solvent: v.solvent,
    preparation_steps: v.preparation_steps
      .filter(s => s.description.trim() || s.amount.trim() || s.instrument_id.trim() || s.time.trim())
      .map((s, idx) => ({ ...s, step_no: idx + 1 })),
    mixing_details: v.mixing_details,
    appearance_notes: v.appearance_notes,
    expiration_date: expDate ?? "",
    storage_condition: v.storage_condition,
    storage_location: v.storage_location,
    container_label: v.container_label,
    notes: v.notes,
    expiration_period_code: v.expiration_period_code,
    expiration_period_days: days,
    initial_solvent: v.initial_solvent,
    final_diluent: v.final_diluent,
    modifier_percent: v.modifier_percent === "" ? null : Number(v.modifier_percent),
    material_overridden: v.material_overridden,
    ref_material_name: v.ref_material_name,
    ref_lot: v.ref_lot,
    ref_form: v.ref_form,
    ref_purity_percent: isLiquid ? null : purity,
    ref_concentration_mg_per_ml: isLiquid ? stockConc : null,
    ref_molecular_weight: v.ref_molecular_weight === "" ? null : Number(v.ref_molecular_weight),
    ref_receipt_date: v.ref_receipt_date || null,
    targets,
  };
}

export function clearPrepDraft(draftKey: string | undefined) {
  if (!draftKey || typeof window === "undefined") return;
  try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
}

export function loadDraft(draftKey: string | undefined): Partial<PrepFormValues> | null {
  if (!draftKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey);
    return raw ? (JSON.parse(raw) as Partial<PrepFormValues>) : null;
  } catch { return null; }
}
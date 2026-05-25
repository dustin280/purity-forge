import type { PrepFormValues } from "@/components/standard-preparations/prep-form";
import { calcStockVolMl } from "@/components/standard-preparations/prep-form-logic";
import { toMgPerMl } from "@/components/standard-preparations/target-units";

function calcMassMg(conc: number, vol: number, purityPct: number | null): number {
  const raw = conc * vol;
  if (!purityPct || purityPct <= 0) return raw;
  return raw / (purityPct / 100);
}

function periodDays(code: string, customDays: string): number | null {
  const PRESETS: Record<string, number> = { "1w": 7, "2w": 14, "4w": 28, "3m": 90, "6m": 180 };
  if (code === "custom") {
    const n = Number(customDays);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return PRESETS[code] ?? null;
}

export function valuesToBatchPayload(v: PrepFormValues, userToken: string) {
  const purity = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  const stockConc = v.ref_concentration_mg_per_ml === "" ? null : Number(v.ref_concentration_mg_per_ml);
  const isLiquid = v.ref_form === "liquid";
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  const targets = v.targets
    .filter(t => t.name.trim() || t.target_concentration_mg_per_ml || t.target_volume_ml)
    .map(t => {
      const raw = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
      const conc = raw != null && Number.isFinite(raw) ? toMgPerMl(raw, t.target_concentration_unit) : null;
      const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
      const mass = !isLiquid && conc != null && vol != null ? calcMassMg(conc, vol, purity) : null;
      const stockVol = isLiquid && conc != null && vol != null ? calcStockVolMl(conc, vol, stockConc) : null;
      return {
        name: t.name,
        target_concentration_mg_per_ml: conc,
        target_concentration_unit: t.target_concentration_unit,
        target_volume_ml: vol,
        calculated_mass_mg: mass,
        calculated_stock_volume_ml: stockVol,
        notes: t.notes ?? "",
      };
    });
  return {
    prepared_at: new Date(v.prepared_at).toISOString(),
    analyst_name: v.analyst_name,
    user_token: userToken,
    batch_label: v.standard_name || null,
    material_receipt_id: v.material_receipt_id || null,
    manufacturer_lot: v.manufacturer_lot || null,
    solvent: v.solvent || null,
    preparation_steps: v.preparation_steps
      .filter(s => s.description.trim() || s.amount.trim() || s.instrument_id.trim() || s.time.trim())
      .map((s, idx) => ({ ...s, step_no: idx + 1 })),
    mixing_details: v.mixing_details || null,
    appearance_notes: v.appearance_notes || null,
    storage_condition: v.storage_condition || null,
    storage_location: v.storage_location || null,
    notes: v.notes || null,
    expiration_period_code: v.expiration_period_code || null,
    expiration_period_days: days,
    initial_solvent: v.initial_solvent || null,
    final_diluent: v.final_diluent || null,
    modifier_percent: v.modifier_percent === "" ? null : Number(v.modifier_percent),
    material_overridden: v.material_overridden,
    ref_material_name: v.ref_material_name || null,
    ref_lot: v.ref_lot || null,
    ref_form: v.ref_form,
    ref_purity_percent: isLiquid ? null : purity,
    ref_concentration_mg_per_ml: isLiquid ? stockConc : null,
    ref_molecular_weight: v.ref_molecular_weight === "" ? null : Number(v.ref_molecular_weight),
    ref_receipt_date: v.ref_receipt_date || null,
    targets,
  };
}
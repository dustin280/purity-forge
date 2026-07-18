export type ConcUnit = "mg/mL" | "mg/L" | "µg/mL" | "µg/L";

export interface SolidSource {
  material_receipt_id: string | null;
  material_name: string;
  lot: string;
  manufacturer: string;
  purity_percent: number | null;
  molecular_weight: number | null;
  received_at: string | null;
  expiry_date: string | null;
}

export interface DiluentSolvent {
  name: string;
  percent: string; // keep as string in form state, coerce at submit
  lot: string;
  manufacturer: string;
  expiry_date: string;
  material_receipt_id: string | null;
}

export interface DiluentModifier {
  type: string;
  percent: string;
  material_receipt_id: string | null;
}

export interface Concentration {
  standard_name: string;
  final_concentration: string;
  final_concentration_unit: ConcUnit;
  final_volume_ml: string;
  expiration_period_code: "1w" | "2w" | "4w" | "3m" | "6m" | "custom";
  expiration_period_days: string;
  storage_condition: string;
  storage_location: string;
  notes: string;
}

export interface SolidFlowState {
  source: SolidSource | null;
  diluent: DiluentSolvent[];
  modifier: DiluentModifier;
  concentration: Concentration;
}

export function emptySolidState(): SolidFlowState {
  return {
    source: null,
    diluent: [emptySolvent()],
    modifier: { type: "", percent: "", material_receipt_id: null },
    concentration: {
      standard_name: "",
      final_concentration: "",
      final_concentration_unit: "mg/mL",
      final_volume_ml: "",
      expiration_period_code: "2w",
      expiration_period_days: "14",
      storage_condition: "Refrigerated (2–8 °C)",
      storage_location: "",
      notes: "",
    },
  };
}

export function emptySolvent(): DiluentSolvent {
  return { name: "", percent: "", lot: "", manufacturer: "", expiry_date: "", material_receipt_id: null };
}

/** Convert final concentration to mg/mL for calculations. */
export function toMgPerMl(value: number, unit: ConcUnit): number {
  switch (unit) {
    case "mg/mL": return value;
    case "mg/L":  return value / 1000;
    case "µg/mL": return value / 1000;
    case "µg/L":  return value / 1_000_000;
  }
}

import type { ConcUnit } from "../solid-flow/types";
import type { PickedStandard } from "../standard-picker";

export type { ConcUnit };

export type WorkingSource = PickedStandard;

export interface WorkingConcentration {
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

export interface WorkingFlowState {
  source: WorkingSource | null;
  diluentName: string;
  diluentLot: string;
  concentration: WorkingConcentration;
}

export function emptyWorkingState(): WorkingFlowState {
  return {
    source: null,
    diluentName: "",
    diluentLot: "",
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

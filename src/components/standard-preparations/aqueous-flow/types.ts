import type { ConcUnit } from "../solid-flow/types";
import type { PickedReceipt } from "../solid-flow/material-receipt-picker";

export type { ConcUnit };

/**
 * A picked material receipt plus the stock concentration, entered inline
 * here rather than persisted onto material_receipts — that table has no
 * concentration field (it's used for solids and liquids alike), and this
 * mirrors the Solid flow's own inline purity backfill rather than adding a
 * schema column for a value only ever needed at this one moment.
 */
export interface AqueousSource extends PickedReceipt {
  stock_concentration_mg_per_ml: number | null;
  available_volume_ml: number | null;
}

export interface AqueousConcentration {
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

export interface AqueousFlowState {
  source: AqueousSource | null;
  diluentName: string;
  diluentLot: string;
  concentration: AqueousConcentration;
}

export function emptyAqueousState(): AqueousFlowState {
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

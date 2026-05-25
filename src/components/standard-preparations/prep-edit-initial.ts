import type { PrepFormValues } from "@/components/standard-preparations/prep-form";
import type { LinkedReceipt } from "@/lib/standard-preparation-pdf";

type PrepRow = {
  prepared_at: string;
  analyst_name: string;
  standard_name: string;
  material_receipt_id: string | null;
  manufacturer_lot: string | null;
  target_concentration: string | null;
  final_volume: string | null;
  solvent: string | null;
  preparation_steps: Array<{ step_no: number; description: string; amount: string; instrument_id: string; time: string }> | null;
  mixing_details: string | null;
  appearance_notes: string | null;
  expiration_date: string | null;
  storage_condition: string | null;
  storage_location: string | null;
  container_label: string | null;
  notes: string | null;
  ref_form?: "solid" | "liquid" | null;
  ref_material_name?: string | null;
  ref_lot?: string | null;
  ref_purity_percent?: number | null;
  ref_concentration_mg_per_ml?: number | null;
  ref_molecular_weight?: number | null;
  ref_receipt_date?: string | null;
};

export function buildPrepEditInitial(r: PrepRow, linked: LinkedReceipt): Partial<PrepFormValues> {
  return {
    prepared_at: r.prepared_at.slice(0, 16),
    analyst_name: r.analyst_name,
    standard_name: r.standard_name,
    material_receipt_id: r.material_receipt_id ?? "",
    material_receipt_label: linked
      ? `${linked.receipt_number} — ${linked.material_name}${linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}`
      : "",
    manufacturer_lot: r.manufacturer_lot ?? "",
    target_concentration: r.target_concentration ?? "",
    final_volume: r.final_volume ?? "",
    solvent: r.solvent ?? "",
    preparation_steps: r.preparation_steps?.length
      ? r.preparation_steps
      : [{ step_no: 1, description: "", amount: "", instrument_id: "", time: "" }],
    mixing_details: r.mixing_details ?? "",
    appearance_notes: r.appearance_notes ?? "",
    expiration_date: r.expiration_date ?? "",
    storage_condition: r.storage_condition ?? "",
    storage_location: r.storage_location ?? "",
    container_label: r.container_label ?? "",
    notes: r.notes ?? "",
    ref_form: (r.ref_form ?? "solid") as "solid" | "liquid",
    ref_material_name: r.ref_material_name ?? "",
    ref_lot: r.ref_lot ?? "",
    ref_purity_percent: r.ref_purity_percent != null ? String(r.ref_purity_percent) : "",
    ref_concentration_mg_per_ml: r.ref_concentration_mg_per_ml != null ? String(r.ref_concentration_mg_per_ml) : "",
    ref_molecular_weight: r.ref_molecular_weight != null ? String(r.ref_molecular_weight) : "",
    ref_receipt_date: r.ref_receipt_date ?? "",
  };
}
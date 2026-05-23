/**
 * Pure helpers + shared types for the Material Receipt form.
 */
import type { MaterialType, QuarantineStatus } from "@/lib/material-receipts.functions";

export interface ReceiptFormValues {
  material_type: MaterialType;
  received_at: string;
  receiver_name: string;
  material_name: string;
  quantity: string;
  unit: string;
  supplier: string;
  po_number: string;
  notes: string;
  freight_tracking_number: string;
  purpose: string;
  manufacturer: string;
  manufacturer_lot: string;
  catalog_number: string;
  expiry_date: string;
  container_details: string;
  coa_attached: boolean;
  sds_attached: boolean;
  visual_inspection: string;
  visual_inspection_notes: string;
  temperature_on_receipt: string;
  internal_lot: string;
  storage_location: string;
  quarantine_status: QuarantineStatus;
  qc_pass: "" | "pass" | "fail";
  qc_results: string;
  qc_analyst: string;
  qc_date: string;
  purity_percent: string;
  molecular_weight: string;
  shelf_life_months: string;
}

export interface PendingAttachments {
  coa: File[];
  sds: File[];
}

export const VISUAL_INSPECTION_OPTIONS = [
  "Pass — no defects",
  "Pass — minor packaging defect",
  "Fail — container damaged",
  "Fail — seal broken",
  "Fail — contamination suspected",
  "Other (see notes)",
];

export function emptyValues(receiverName: string): ReceiptFormValues {
  return {
    material_type: "controlled",
    received_at: new Date().toISOString().slice(0, 16),
    receiver_name: receiverName,
    material_name: "",
    quantity: "",
    unit: "",
    supplier: "",
    po_number: "",
    notes: "",
    freight_tracking_number: "",
    purpose: "",
    manufacturer: "",
    manufacturer_lot: "",
    catalog_number: "",
    expiry_date: "",
    container_details: "",
    coa_attached: false,
    sds_attached: false,
    visual_inspection: "",
    visual_inspection_notes: "",
    temperature_on_receipt: "",
    internal_lot: "",
    storage_location: "",
    quarantine_status: "quarantine",
    qc_pass: "",
    qc_results: "",
    qc_analyst: "",
    qc_date: "",
    purity_percent: "",
    molecular_weight: "",
    shelf_life_months: "",
  };
}

export function valuesToPayload(v: ReceiptFormValues) {
  return {
    material_type: v.material_type,
    received_at: new Date(v.received_at).toISOString(),
    receiver_name: v.receiver_name,
    material_name: v.material_name,
    quantity: v.quantity === "" ? null : Number(v.quantity),
    unit: v.unit,
    supplier: v.supplier,
    po_number: v.po_number,
    notes: v.notes,
    freight_tracking_number: v.freight_tracking_number,
    purpose: v.material_type === "uncontrolled" ? v.purpose : null,
    manufacturer: v.material_type === "controlled" ? v.manufacturer : null,
    manufacturer_lot: v.material_type === "controlled" ? v.manufacturer_lot : null,
    catalog_number: v.material_type === "controlled" ? v.catalog_number : null,
    expiry_date: v.material_type === "controlled" && v.expiry_date ? v.expiry_date : null,
    container_details: v.material_type === "controlled" ? v.container_details : null,
    coa_attached: v.coa_attached,
    sds_attached: v.sds_attached,
    visual_inspection: v.material_type === "controlled" ? v.visual_inspection : null,
    visual_inspection_notes: v.material_type === "controlled" ? v.visual_inspection_notes : null,
    temperature_on_receipt:
      v.material_type === "controlled" && v.temperature_on_receipt !== ""
        ? Number(v.temperature_on_receipt)
        : null,
    internal_lot: v.material_type === "controlled" ? v.internal_lot : null,
    storage_location: v.material_type === "controlled" ? v.storage_location : null,
    quarantine_status: v.material_type === "controlled" ? v.quarantine_status : "released" as const,
    qc_pass: v.qc_pass === "" ? null : v.qc_pass === "pass",
    qc_results: v.material_type === "controlled" ? v.qc_results : null,
    qc_analyst: v.material_type === "controlled" ? v.qc_analyst : null,
    qc_date: v.material_type === "controlled" && v.qc_date ? v.qc_date : null,
    purity_percent:
      v.material_type === "controlled" && v.purity_percent !== ""
        ? Number(v.purity_percent)
        : null,
    molecular_weight:
      v.material_type === "controlled" && v.molecular_weight !== ""
        ? Number(v.molecular_weight)
        : null,
    shelf_life_months:
      v.material_type === "controlled" && v.shelf_life_months !== ""
        ? Number(v.shelf_life_months)
        : null,
  };
}

export type MaterialSuggestion = {
  id: string;
  name: string;
  material_type: MaterialType;
  manufacturer: string | null;
  catalog_number: string | null;
};
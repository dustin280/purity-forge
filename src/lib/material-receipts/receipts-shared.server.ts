import { z } from "zod";

export const MATERIAL_TYPES = ["controlled", "uncontrolled"] as const;
export const QUARANTINE_STATUSES = ["quarantine", "released", "rejected"] as const;
export const ATTACHMENT_KINDS = ["coa", "sds", "packing_slip", "label", "photo", "other"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type QuarantineStatus = (typeof QUARANTINE_STATUSES)[number];
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface MaterialReceiptRow {
  id: string;
  receipt_number: string;
  material_type: MaterialType;
  received_at: string;
  received_by: string | null;
  receiver_name: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  po_number: string | null;
  notes: string | null;
  freight_tracking_number: string | null;
  purpose: string | null;
  manufacturer: string | null;
  manufacturer_lot: string | null;
  catalog_number: string | null;
  serial_number: string | null;
  expiry_date: string | null;
  container_details: string | null;
  coa_attached: boolean;
  sds_attached: boolean;
  visual_inspection: string | null;
  visual_inspection_notes: string | null;
  temperature_on_receipt: number | null;
  internal_lot: string | null;
  storage_location: string | null;
  quarantine_status: QuarantineStatus;
  qc_pass: boolean | null;
  qc_results: string | null;
  qc_analyst: string | null;
  qc_date: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approver_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  purity_percent: number | null;
  molecular_weight: number | null;
  shelf_life_months: number | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  gl_account: string | null;
  tax_amount: number | null;
  shipping_cost: number | null;
}

export interface AttachmentRow {
  id: string;
  receipt_id: string;
  kind: AttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const receiptPayloadSchema = z.object({
  material_type: z.enum(MATERIAL_TYPES),
  received_at: z.string().min(1),
  receiver_name: z.string().min(1).max(255),
  material_name: z.string().min(1).max(255),
  quantity: z.number().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  po_number: z.string().max(100).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  freight_tracking_number: z.string().max(255).nullable().optional(),
  purpose: z.string().max(500).nullable().optional(),
  manufacturer: z.string().max(255).nullable().optional(),
  manufacturer_lot: z.string().max(100).nullable().optional(),
  catalog_number: z.string().max(100).nullable().optional(),
  serial_number: z.string().max(100).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  container_details: z.string().max(500).nullable().optional(),
  coa_attached: z.boolean().optional(),
  sds_attached: z.boolean().optional(),
  visual_inspection: z.string().max(100).nullable().optional(),
  visual_inspection_notes: z.string().max(2000).nullable().optional(),
  temperature_on_receipt: z.number().nullable().optional(),
  internal_lot: z.string().max(100).nullable().optional(),
  storage_location: z.string().max(255).nullable().optional(),
  quarantine_status: z.enum(QUARANTINE_STATUSES).optional(),
  qc_pass: z.boolean().nullable().optional(),
  qc_results: z.string().max(2000).nullable().optional(),
  qc_analyst: z.string().max(255).nullable().optional(),
  qc_date: z.string().nullable().optional(),
  purity_percent: z.number().nullable().optional(),
  molecular_weight: z.number().nullable().optional(),
  shelf_life_months: z.number().int().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total_price: z.number().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  invoice_number: z.string().max(100).nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  gl_account: z.string().max(100).nullable().optional(),
  tax_amount: z.number().nullable().optional(),
  shipping_cost: z.number().nullable().optional(),
});

export function emptyToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out as T;
}
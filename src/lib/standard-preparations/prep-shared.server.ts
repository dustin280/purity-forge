/**
 * Shared types, constants, Zod schemas, and tiny helpers for the Standard
 * Preparations server functions. Lives in a `.server.ts` module so that any
 * `.functions.ts` file can safely import it without triggering the
 * `tss-serverfn-split` sibling-reference pitfall.
 */
import { z } from "zod";

export const PREP_STATUSES = ["draft", "reviewed", "approved"] as const;
export const PREP_ATTACHMENT_KINDS = ["weighing", "label", "photo", "sequence", "coa", "other"] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];
export type PrepAttachmentKind = (typeof PREP_ATTACHMENT_KINDS)[number];

export interface PrepStep {
  step_no: number;
  description: string;
  amount: string;
  instrument_id: string;
  time: string;
}

export interface PrepTarget {
  row_no: number;
  name: string;
  target_concentration_mg_per_ml: number | null;
  target_concentration_unit?: string;
  target_volume_ml: number | null;
  calculated_mass_mg: number | null;
  calculated_volume_ml: number | null;
  notes: string;
}

export interface PrepTargetRow extends PrepTarget {
  id: string;
  prep_id: string;
  created_at: string;
}

export interface StandardPrepRow {
  id: string;
  log_number: string;
  batch_group_id: string | null;
  prepared_at: string;
  analyst_id: string | null;
  analyst_name: string;
  standard_name: string;
  material_receipt_id: string | null;
  manufacturer_lot: string | null;
  target_concentration: string | null;
  final_volume: string | null;
  solvent: string | null;
  preparation_steps: PrepStep[];
  mixing_details: string | null;
  appearance_notes: string | null;
  expiration_date: string | null;
  storage_condition: string | null;
  storage_location: string | null;
  container_label: string | null;
  prep_type: string | null;
  status: PrepStatus;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  approver_id: string | null;
  approver_name: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expiration_period_code: string | null;
  expiration_period_days: number | null;
  initial_solvent: string | null;
  final_diluent: string | null;
  modifier_percent: number | null;
  material_overridden: boolean;
  ref_material_name: string | null;
  ref_lot: string | null;
  ref_form: "solid" | "liquid";
  ref_purity_percent: number | null;
  ref_concentration_mg_per_ml: number | null;
  ref_molecular_weight: number | null;
  ref_receipt_date: string | null;
  final_volume_ml: number | null;
  volume_remaining_ml: number | null;
  lifecycle_status: string;
}

export interface PrepAttachmentRow {
  id: string;
  log_id: string;
  kind: PrepAttachmentKind;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const stepSchema = z.object({
  step_no: z.number().int().min(1).max(999),
  description: z.string().max(2000),
  amount: z.string().max(255),
  instrument_id: z.string().max(255),
  time: z.string().max(255),
});

export const targetSchema = z.object({
  row_no: z.number().int().min(1).max(999),
  name: z.string().max(255),
  target_concentration_mg_per_ml: z.number().nullable(),
  target_concentration_unit: z.enum(["mg/mL", "mg/L"]).optional().default("mg/mL"),
  target_volume_ml: z.number().nullable(),
  calculated_mass_mg: z.number().nullable(),
  calculated_volume_ml: z.number().nullable(),
  notes: z.string().max(2000),
});

export const payloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  standard_name: z.string().min(1).max(255),
  material_receipt_id: z.string().uuid().nullable().optional(),
  manufacturer_lot: z.string().max(255).nullable().optional(),
  target_concentration: z.string().max(255).nullable().optional(),
  final_volume: z.string().max(255).nullable().optional(),
  solvent: z.string().max(500).nullable().optional(),
  preparation_steps: z.array(stepSchema).max(100).optional(),
  mixing_details: z.string().max(2000).nullable().optional(),
  appearance_notes: z.string().max(2000).nullable().optional(),
  expiration_date: z.string().nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  container_label: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  initial_solvent: z.string().max(500).nullable().optional(),
  final_diluent: z.string().max(500).nullable().optional(),
  modifier_percent: z.number().nullable().optional(),
  material_overridden: z.boolean().optional(),
  ref_material_name: z.string().max(255).nullable().optional(),
  ref_lot: z.string().max(255).nullable().optional(),
  ref_form: z.enum(["solid", "liquid"]).optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_concentration_mg_per_ml: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  targets: z.array(targetSchema).max(500).optional(),
});

export const batchTargetSchema = z.object({
  name: z.string().max(255),
  target_concentration_mg_per_ml: z.number().nullable(),
  target_concentration_unit: z.enum(["mg/mL", "mg/L"]).optional().default("mg/mL"),
  target_volume_ml: z.number().nullable(),
  calculated_mass_mg: z.number().nullable(),
  calculated_stock_volume_ml: z.number().nullable().optional(),
  notes: z.string().max(2000),
});

export const batchPayloadSchema = z.object({
  prepared_at: z.string().min(1),
  analyst_name: z.string().min(1).max(255),
  user_token: z.string().min(1).max(16),
  batch_label: z.string().max(255).nullable().optional(),
  material_receipt_id: z.string().uuid().nullable().optional(),
  manufacturer_lot: z.string().max(255).nullable().optional(),
  solvent: z.string().max(500).nullable().optional(),
  preparation_steps: z.array(stepSchema).max(100).optional(),
  mixing_details: z.string().max(2000).nullable().optional(),
  appearance_notes: z.string().max(2000).nullable().optional(),
  storage_condition: z.string().max(500).nullable().optional(),
  storage_location: z.string().max(500).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  expiration_period_code: z.string().max(20).nullable().optional(),
  expiration_period_days: z.number().int().nullable().optional(),
  initial_solvent: z.string().max(500).nullable().optional(),
  final_diluent: z.string().max(500).nullable().optional(),
  modifier_percent: z.number().nullable().optional(),
  material_overridden: z.boolean().optional(),
  ref_material_name: z.string().max(255).nullable().optional(),
  ref_lot: z.string().max(255).nullable().optional(),
  ref_form: z.enum(["solid", "liquid"]).optional(),
  ref_purity_percent: z.number().nullable().optional(),
  ref_concentration_mg_per_ml: z.number().nullable().optional(),
  ref_molecular_weight: z.number().nullable().optional(),
  ref_receipt_date: z.string().nullable().optional(),
  targets: z.array(batchTargetSchema).min(1).max(200),
});

export function emptyToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out as T;
}

export function addDaysISO(dateInput: string, days: number): string {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}
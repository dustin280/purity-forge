/**
 * Shared types for the Chain of Custody UI components. Co-located here so the
 * route file and extracted components agree on the shape of CoC fields,
 * records, and per-row line items without circular imports.
 */

export type CocField = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "date" | "datetime" | "email" | "tel" | "multiselect";
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  placeholder: string | null;
  /** Pre-fills this field on a new receipt. Configured per field in admin. */
  default_value: string | null;
};

export type CocRecord = {
  id: string;
  sample_id: string;
  data: Record<string, unknown>;
  created_at: string;
};

export type LineItemComponent = {
  compound_id: string | null;
  compound: string;
  label_content_value: string;
  label_content_unit: "" | "mg" | "ug";
};

export type CocLineItemView = {
  compound?: string; partner_reported_name?: string; lot?: string; catalog?: string; manufacturer?: string;
  container_size?: string;
  vial_count?: number;
  requested_tests?: string[];
  client_received_date?: string; manufacture_date?: string;
  physical_description?: string;
  physical_form?: "" | "solid" | "liquid" | "capsule";
  label_content_value?: string; label_content_unit?: "" | "mg" | "ug";
  is_multi_component?: boolean;
  components?: LineItemComponent[];
  bottle_size?: string; liquid_volume_ml?: string; label_content_basis?: "" | "per_ml" | "per_bottle";
  capsule_count?: string;
};

export type LineItem = {
  compound: string; compound_id: string | null; lot: string; catalog: string; manufacturer: string;
  /** The partner's original, as-submitted product name — preserved independent
   * of whatever ends up picked via the compound selector, so discrepancies
   * between what they call it and what we file it as can be reconciled later. */
  partner_reported_name: string;
  container_size: string;
  vial_count: number;
  requested_tests: string[];
  client_received_date: string; manufacture_date: string; physical_description: string;
  physical_form: "" | "solid" | "liquid" | "capsule";
  label_content_value: string; label_content_unit: "" | "mg" | "ug";
  /** True when this product is a blend of multiple compounds (e.g. "KLOW" =
   * BPC-157 + TB-500 + KPV + GHK-Cu). The primary compound/label content
   * stay in the fields above; `components` holds every ADDITIONAL compound
   * in the blend beyond that primary one. */
  is_multi_component: boolean;
  components: LineItemComponent[];
  // Liquid-specific.
  bottle_size: string; liquid_volume_ml: string; label_content_basis: "" | "per_ml" | "per_bottle";
  // Capsule-specific.
  capsule_count: string;
};

export const emptyLineComponent = (): LineItemComponent => ({
  compound_id: null, compound: "", label_content_value: "", label_content_unit: "",
});

// ---------------------------------------------------------------------------
// Three-level intake shape (see src/lib/lims/sample-hierarchy.ts):
//   shipment (the CoC record) -> LotRow (a product) -> VialRow (one test vial)
// LineItem above is the older flat shape, still used by the legacy
// submitCocWithSamples path and by edit mode on existing records.
// ---------------------------------------------------------------------------

import type { TestType } from "@/lib/lims/sample-hierarchy";

/** One physical vial, assigned to exactly one test. Becomes a `samples` row. */
export type VialRow = {
  test_type: TestType;
  /** The partner's own per-vial lot string, preserved verbatim -- their
   *  export API is polled by this exact value. Blank for vials we added
   *  ourselves, which fall back to the lot's base customer lot. */
  partner_lot: string;
  /** Per-vial appearance override; blank means "inherit the lot's". */
  physical_description: string;
  notes: string;
};

/** One product/lot within a shipment. Becomes a `sample_lots` row. */
export type LotRow = {
  customer_lot: string;
  /**
   * Optional common/marketing name for the product as a whole (SUMMIT,
   * KLOW). Blank is fine -- a name is then constructed by joining the
   * component compounds. NOT one of the compounds itself; a blend has no
   * "primary" compound.
   */
  display_name: string;
  /** The partner's original product string. Reference only -- never edited,
   *  never treated as a compound, kept so their wording stays recoverable. */
  partner_reported_name: string;
  catalog: string;
  manufacturer: string;
  container_size: string;
  client_received_date: string;
  manufacture_date: string;
  physical_form: "" | "solid" | "liquid" | "capsule";
  appearance_texture: string;
  appearance_texture_other: string;
  appearance_color: string;
  is_multi_component: boolean;
  /** Every compound in this product, 1..N, each with its own amount. The
   *  lot's total label content is the SUM of these (totalLabelContentMg). */
  components: LineItemComponent[];
  bottle_size: string;
  liquid_volume_ml: string;
  label_content_basis: "" | "per_ml" | "per_bottle";
  capsule_count: string;
  notes: string;
  vials: VialRow[];
};

export const emptyVial = (test_type: TestType = "purity"): VialRow => ({
  test_type, partner_lot: "", physical_description: "", notes: "",
});

export const emptyLot = (): LotRow => ({
  customer_lot: "", display_name: "", partner_reported_name: "",
  catalog: "", manufacturer: "", container_size: "",
  client_received_date: "", manufacture_date: "",
  physical_form: "", appearance_texture: "", appearance_texture_other: "", appearance_color: "",
  is_multi_component: false,
  components: [emptyLineComponent()],
  bottle_size: "", liquid_volume_ml: "", label_content_basis: "", capsule_count: "",
  notes: "",
  vials: [emptyVial("purity")],
});

export const emptyLine = (): LineItem => ({
  compound: "", compound_id: null, lot: "", catalog: "", manufacturer: "",
  partner_reported_name: "",
  container_size: "",
  vial_count: 1,
  requested_tests: [],
  client_received_date: "", manufacture_date: "", physical_description: "",
  physical_form: "",
  label_content_value: "", label_content_unit: "",
  is_multi_component: false,
  components: [],
  bottle_size: "", liquid_volume_ml: "", label_content_basis: "",
  capsule_count: "",
});

export type CocAttachmentRow = {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
};
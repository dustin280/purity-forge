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
  compound?: string; lot?: string; catalog?: string; manufacturer?: string;
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

export const emptyLine = (): LineItem => ({
  compound: "", compound_id: null, lot: "", catalog: "", manufacturer: "",
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
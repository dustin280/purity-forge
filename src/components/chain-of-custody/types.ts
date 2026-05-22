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

export type CocLineItemView = {
  compound?: string; lot?: string; catalog?: string; manufacturer?: string;
  quantity?: string; quantity_unit?: string;
  container_size?: string; concentration?: string;
  vial_count?: number; temperature_c?: string | number;
  storage?: string; requested_tests?: string[];
  client_received_date?: string; manufacture_date?: string;
  physical_description?: string;
};

export type LineItem = {
  compound: string; lot: string; catalog: string; manufacturer: string;
  quantity: string; quantity_unit: string;
  container_size: string; concentration: string;
  vial_count: number; temperature_c: string;
  storage: string; requested_tests: string[];
  client_received_date: string; manufacture_date: string; physical_description: string;
};

export const emptyLine = (): LineItem => ({
  compound: "", lot: "", catalog: "", manufacturer: "",
  quantity: "", quantity_unit: "",
  container_size: "", concentration: "",
  vial_count: 1, temperature_c: "",
  storage: "", requested_tests: [],
  client_received_date: "", manufacture_date: "", physical_description: "",
});

export type CocAttachmentRow = {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
};
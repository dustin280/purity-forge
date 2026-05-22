export type FieldType = "text" | "textarea" | "number" | "date" | "datetime" | "email" | "tel" | "multiselect";

export type CocField = {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  placeholder: string | null;
};

export const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "multiselect", label: "Multi-select" },
];

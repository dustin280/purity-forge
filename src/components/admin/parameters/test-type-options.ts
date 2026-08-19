export type NonPurityTestType = "sterility" | "endotoxin" | "heavy_metals";

export const TEST_TYPE_OPTIONS: { value: NonPurityTestType; label: string }[] = [
  { value: "sterility", label: "Sterility" },
  { value: "endotoxin", label: "Endotoxin" },
  { value: "heavy_metals", label: "Heavy Metals" },
];

export const TEST_TYPE_LABEL: Record<NonPurityTestType, string> = {
  sterility: "Sterility", endotoxin: "Endotoxin", heavy_metals: "Heavy Metals",
};

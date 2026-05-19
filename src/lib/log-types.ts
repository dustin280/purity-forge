export type LogTypeKey = "standard_prep" | "reagent_prep" | "sample_prep" | "qc_prep";

export const LOG_TYPES: { key: LogTypeKey; title: string; description: string }[] = [
  { key: "standard_prep", title: "Standard Preparation Log", description: "Document reference standard preparation." },
  { key: "reagent_prep", title: "Reagent Preparation Log", description: "Document reagent preparation and lot tracking." },
  { key: "sample_prep", title: "Sample Preparation Log", description: "Track sample preparation steps and conditions." },
  { key: "qc_prep", title: "QC Preparation Log", description: "Document quality control sample preparation." },
];

export const LOG_TYPE_MAP = Object.fromEntries(LOG_TYPES.map(l => [l.key, l])) as Record<LogTypeKey, typeof LOG_TYPES[number]>;

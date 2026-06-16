import partsCsv from "@/data/agilent-parts.csv?raw";

export type PartRow = {
  module: string;
  subsystem: string;
  description: string;
  partNumber: string;
  replaces: string;
  status: string;
  serviceNote: string;
  whereToBuy: string;
  notes: string;
};

/** Minimal CSV parser that handles quoted fields with embedded commas and "" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

let cache: PartRow[] | null = null;

export function loadParts(): PartRow[] {
  if (cache) return cache;
  const rows = parseCsv(partsCsv);
  const [, ...data] = rows;
  cache = data.map(r => ({
    module: r[0] ?? "",
    subsystem: r[1] ?? "",
    description: r[2] ?? "",
    partNumber: r[3] ?? "",
    replaces: r[4] ?? "",
    status: r[5] ?? "",
    serviceNote: r[6] ?? "",
    whereToBuy: r[7] ?? "",
    notes: r[8] ?? "",
  }));
  return cache;
}
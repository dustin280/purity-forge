import partsCsv from "@/data/agilent-parts.csv?raw";
import pricesCsv from "@/data/agilent-parts-prices.csv?raw";

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
  price?: string;
  priceStatus?: string;
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
  const priceRows = parseCsv(pricesCsv);
  const [, ...priceData] = priceRows;
  const priceMap = new Map<string, { price: string; status: string }>();
  for (const r of priceData) {
    const pn = (r[0] ?? "").trim();
    if (!pn) continue;
    priceMap.set(pn, { price: (r[1] ?? "").trim(), status: (r[2] ?? "").trim() });
  }
  const UNKNOWN = "No public list price found";
  cache = data.map(r => {
    const partNumber = r[3] ?? "";
    const pr = priceMap.get(partNumber.trim());
    const rawPrice = pr?.price ?? "";
    return {
    module: r[0] ?? "",
    subsystem: r[1] ?? "",
    description: r[2] ?? "",
      partNumber,
    replaces: r[4] ?? "",
    status: r[5] ?? "",
    serviceNote: r[6] ?? "",
    whereToBuy: r[7] ?? "",
    notes: r[8] ?? "",
      price: rawPrice && rawPrice !== UNKNOWN ? rawPrice : "",
      priceStatus: pr?.status ?? "",
    };
  });
  return cache;
}
import columnsCsv from "@/data/hplc-columns.csv?raw";

export type ColumnRow = {
  rowType: string;
  name: string;
  partNumber: string;
  description: string;
  specs: string;
  application: string;
  price: string;
  productFamily: string;
  separationMode: string;
  particleSize: string;
  innerDiameter: string;
  length: string;
  poreSize: string;
  hardware: string;
  guardColumn: string;
  unit: string;
  skuCount: string;
  sourceUrl: string;
  completenessNote: string;
  guardPartNumber: string;
  guardName: string;
  guardAgilentLink: string;
  guardHolderLink: string;
  guardMatchStatus: string;
  guardMatchingNotes: string;
};

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

let cache: ColumnRow[] | null = null;

export function loadColumns(): ColumnRow[] {
  if (cache) return cache;
  const rows = parseCsv(columnsCsv);
  const [, ...data] = rows;
  cache = data.map(r => ({
    rowType: r[0] ?? "",
    name: r[1] ?? "",
    partNumber: r[2] ?? "",
    description: r[3] ?? "",
    specs: r[4] ?? "",
    application: r[5] ?? "",
    price: r[6] ?? "",
    productFamily: r[7] ?? "",
    separationMode: r[8] ?? "",
    particleSize: r[9] ?? "",
    innerDiameter: r[10] ?? "",
    length: r[11] ?? "",
    poreSize: r[12] ?? "",
    hardware: r[13] ?? "",
    guardColumn: r[14] ?? "",
    unit: r[15] ?? "",
    skuCount: r[16] ?? "",
    sourceUrl: r[17] ?? "",
    completenessNote: r[18] ?? "",
    guardPartNumber: r[19] ?? "",
    guardName: r[20] ?? "",
    guardAgilentLink: r[21] ?? "",
    guardHolderLink: r[22] ?? "",
    guardMatchStatus: r[23] ?? "",
    guardMatchingNotes: r[24] ?? "",
  }));
  return cache;
}

/** Compact catalog text for the AI advisor prompt. */
export function catalogForPrompt(): string {
  return loadColumns()
    .filter(c => c.rowType !== "Family")
    .map(c => {
      const fields = [
        `PN=${c.partNumber}`,
        c.name && `Name=${c.name}`,
        c.productFamily && `Family=${c.productFamily}`,
        c.separationMode && `Mode=${c.separationMode}`,
        c.particleSize && `Particle=${c.particleSize}`,
        c.innerDiameter && `ID=${c.innerDiameter}`,
        c.length && `Len=${c.length}`,
        c.poreSize && `Pore=${c.poreSize}`,
        c.hardware && `HW=${c.hardware}`,
        c.application && `App=${c.application}`,
        c.specs && `Specs=${c.specs}`,
        c.guardPartNumber && `Guard=${c.guardPartNumber}`,
      ].filter(Boolean);
      return `- ${fields.join(" | ")}`;
    })
    .join("\n");
}
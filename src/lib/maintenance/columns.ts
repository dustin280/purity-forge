import agilentCsv from "@/data/hplc-columns.csv?raw";
import watersCsv from "@/data/waters-columns.csv?raw";
import phenomenexCsv from "@/data/phenomenex-columns.csv?raw";

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

export type VendorId = "agilent" | "waters" | "phenomenex";

export type VendorMeta = {
  id: VendorId;
  label: string;
  /** Prefix prepended to part number when building an eBay search. */
  searchPrefix: string;
  /** Column header / link label for the vendor's product page. */
  linkLabel: string;
  comingSoon?: boolean;
};

export const VENDORS: VendorMeta[] = [
  { id: "agilent",    label: "Agilent",    searchPrefix: "Agilent",    linkLabel: "Agilent" },
  { id: "waters",     label: "Waters",     searchPrefix: "Waters",     linkLabel: "Waters" },
  { id: "phenomenex", label: "Phenomenex", searchPrefix: "Phenomenex", linkLabel: "Phenomenex" },
];

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

const cache = new Map<VendorId, ColumnRow[]>();

function parseRows(csv: string): ColumnRow[] {
  const rows = parseCsv(csv);
  const [, ...data] = rows;
  return data.map(r => ({
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
}

/** Phenomenex CSV has no SKU Count / Completeness Note columns. */
function parseRowsPhenomenex(csv: string): ColumnRow[] {
  const rows = parseCsv(csv);
  const [, ...data] = rows;
  return data.map(r => ({
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
    skuCount: "",
    sourceUrl: r[16] ?? "",
    completenessNote: "",
    guardPartNumber: r[17] ?? "",
    guardName: r[18] ?? "",
    guardAgilentLink: r[19] ?? "",
    guardHolderLink: r[20] ?? "",
    guardMatchStatus: r[21] ?? "",
    guardMatchingNotes: r[22] ?? "",
  }));
}

const VENDOR_PARSERS: Record<VendorId, () => ColumnRow[]> = {
  agilent: () => parseRows(agilentCsv),
  waters: () => parseRows(watersCsv),
  phenomenex: () => parseRowsPhenomenex(phenomenexCsv),
};

export function loadVendorColumns(vendor: VendorId): ColumnRow[] {
  const cached = cache.get(vendor);
  if (cached) return cached;
  const parse = VENDOR_PARSERS[vendor];
  const rows = parse ? parse() : [];
  cache.set(vendor, rows);
  return rows;
}

/** Back-compat: defaults to Agilent. */
export function loadColumns(): ColumnRow[] {
  return loadVendorColumns("agilent");
}

/** Compact catalog text for the AI advisor prompt. */
export function catalogForPrompt(): string {
  const sections: string[] = [];
  for (const v of VENDORS) {
    if (v.comingSoon) continue;
    const rows = loadVendorColumns(v.id).filter(c => c.rowType !== "Family");
    if (rows.length === 0) continue;
    const body = rows
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
        return `- [${v.label}] ${fields.join(" | ")}`;
      })
      .join("\n");
    sections.push(`## ${v.label}\n${body}`);
  }
  return sections.join("\n\n");
}
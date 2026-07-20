/**
 * Build a minimal Agilent OpenLab-compatible sequence CSV from a plain list
 * of label strings. Used by the Vial Labels "Generate 1 Off Sequence" button.
 *
 * Format mirrors sequenceToCsv() in src/lib/run-lists/generate.functions.ts:
 * same 9 headers, CRLF line endings, csv-escaped cells. Caller prepends the
 * UTF-8 BOM before writing the file.
 */

const HEADERS = [
  "Sample name", "Sample type", "Vial", "Volume",
  "Acq Method", "Proc Method", "Data file", "Description", "Level",
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Standard Agilent 2-tray sampler: two plates ("P1", "P2"), each with rows
 * A–F and columns 1–9 (54 vials/plate). Accepts codes like "P1-A1" or "P2-F9".
 * Returns null if we've walked past the end of P2.
 */
const ROWS = ["A", "B", "C", "D", "E", "F"] as const;
const COLS_PER_ROW = 9;

export function nextVial(code: string): string | null {
  const m = /^P([12])-([A-F])(\d+)$/i.exec(code.trim());
  if (!m) return null;
  let plate = Number(m[1]);
  let rowIdx = ROWS.indexOf(m[2].toUpperCase() as (typeof ROWS)[number]);
  let col = Number(m[3]);
  col += 1;
  if (col > COLS_PER_ROW) { col = 1; rowIdx += 1; }
  if (rowIdx >= ROWS.length) { rowIdx = 0; plate += 1; }
  if (plate > 2) return null;
  return `P${plate}-${ROWS[rowIdx]}${col}`;
}

export function buildOneOffSequenceCsv(labels: string[], startVial?: string): string {
  const useVial = !!startVial && /^P[12]-[A-F]\d+$/i.test(startVial.trim());
  let vial: string | null = useVial ? startVial!.trim().toUpperCase() : null;
  const rows = labels.map((label) => {
    const cells = [
      label,
      "Sample",
      vial ?? "",
      "", // Volume — blank = Use Method
      "", // Acq Method
      "", // Proc Method
      "", // Data file
      "", // Description
      "", // Level
    ].map(csvEscape).join(",");
    if (vial) vial = nextVial(vial);
    return cells;
  });
  return [HEADERS.join(","), ...rows].join("\r\n");
}

export function oneOffFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = p(now.getMonth() + 1);
  const dd = p(now.getDate());
  const hh = p(now.getHours());
  const mi = p(now.getMinutes());
  const ss = p(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_OneOff_${hh}${mi}${ss}.csv`;
}
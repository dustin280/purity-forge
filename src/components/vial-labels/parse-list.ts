import * as XLSX from "xlsx";

function looksLikeHeader(s: string) {
  const t = s.trim().toLowerCase();
  return ["label", "labels", "name", "item", "vial", "id", "sample"].includes(t);
}

function cleanLines(lines: string[]): string[] {
  const out = lines.map(l => l.replace(/\r$/, "").trim()).filter(Boolean);
  if (out.length && looksLikeHeader(out[0])) out.shift();
  return out;
}

export async function parseListFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" });
    return cleanLines(rows.map(r => (r[0] == null ? "" : String(r[0]))));
  }
  const text = await file.text();
  if (name.endsWith(".csv")) {
    return cleanLines(text.split(/\r?\n/).map(l => {
      // take first CSV field, handle simple quoted values
      const m = l.match(/^\s*"((?:[^"]|"")*)"|^\s*([^,]*)/);
      return m ? (m[1] ?? m[2] ?? "").replace(/""/g, '"') : l;
    }));
  }
  return cleanLines(text.split(/\r?\n/));
}
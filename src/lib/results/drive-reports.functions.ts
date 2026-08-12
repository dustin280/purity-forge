/**
 * Lets an analyst pick a completed instrument report PDF from the
 * "LM-Reports Complete" Drive folder and auto-fill a result instead of
 * hand-formatting a paste. Drive mechanics mirror the connector-gateway
 * pattern already used in src/lib/openlab-drive.functions.ts and
 * src/lib/sample-prep/accept.functions.ts — duplicated locally per the
 * existing convention in this codebase rather than sharing a module.
 *
 * The parser below was built and verified against real pdf-parse output
 * from two actual report PDFs (single-analyte and KLOW/GLOW multi-component
 * templates) pulled from the lab's own LM-Reports Complete folder — the
 * PDF text has NO whitespace between the compound name and its numbers
 * (e.g. "BPC-1578.25910.747107.47%99.28%"), so the parser anchors on the
 * one reliable fixed-format token in every row: retention time, which is
 * always a single digit, a decimal point, and exactly 3 digits (`\d.\d{3}`).
 * Everything is still surfaced to the analyst for review before saving —
 * this is a best-effort auto-fill, not a silent auto-submit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Peak } from "@/lib/lims-utils";
// pdf-parse's own wrapper (pdf-parse/lib/pdf-parse.js) resolves its PDF.js
// engine via `require(`./pdf.js/${version}/build/pdf.js`)` — a template-
// string require Rollup can't statically analyze, so it throws
// "Could not dynamically require..." in the deployed Cloudflare Workers
// build (this only ever "worked" when pdf-parse was exercised directly in
// a plain Node process, never through the actual bundled server). Importing
// the same bundled engine via a static path sidesteps Rollup's dynamic-
// require limitation entirely; the few lines below are a direct port of
// pdf-parse's own PDF() wrapper (lib/pdf-parse.js) so parsing behavior is
// unchanged — just resolved at build time instead of at runtime. No types
// ship for this internal vendor path, hence the ts-expect-error below.
// @ts-expect-error — untyped vendor JS module, see comment above
import PDFJSDefault from "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js";

type PdfParseFn = (data: Buffer) => Promise<{ text: string }>;
export const pdfParse: PdfParseFn = async (dataBuffer: Buffer) => {
  // Rollup's ESM interop for this CJS module yields a frozen exports
  // object — setting disableWorker directly on it throws ("object is not
  // extensible"). Wrapping it in a plain object that prototype-delegates
  // to it keeps every inherited method (getDocument, etc.) while making
  // disableWorker a genuinely settable own property.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = PDFJSDefault as any;
  const engine = Object.create(source);
  engine.disableWorker = true;
  const doc = await engine.getDocument(dataBuffer);
  let text = "";
  const pageCount = doc.numPages;
  for (let i = 1; i <= pageCount; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageText = await doc.getPage(i).then((pageData: any) =>
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((textContent: any) => {
        let lastY: number | undefined;
        let out = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of textContent.items as any[]) {
          if (lastY === item.transform[5] || lastY === undefined) out += item.str;
          else out += `\n${item.str}`;
          lastY = item.transform[5];
        }
        return out;
      })
    ).catch(() => "");
    text += `\n\n${pageText}`;
  }
  doc.destroy();
  return { text };
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error("Google Drive is not connected. Link the Google Drive connector in Project Settings.");
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

// Exported: shared with report-reconciliation.functions.ts (both the
// single-file picker and the bulk/automated reconciliation path need the
// same Drive access + parsing).
// Reports come in either as PDF (the original OpenLab CDS export) or, once
// the lab finishes moving report generation to Excel, .xlsx — the query
// accepts both so the folder can hold a mix during the transition.
const REPORT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // legacy .xls
];

export async function driveList(folderId: string): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> {
  const mimeClause = REPORT_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(" or ");
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and (${mimeClause})`);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=modifiedTime desc`, {
    headers: gatewayHeaders(),
  });
  if (!r.ok) throw new Error(`Drive list failed (${r.status}): ${await r.text()}`);
  const json = (await r.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
  return json.files ?? [];
}

export async function driveDownload(fileId: string): Promise<ArrayBuffer> {
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, { headers: gatewayHeaders() });
  if (!r.ok) throw new Error(`Drive download ${fileId} failed (${r.status})`);
  return await r.arrayBuffer();
}

// The chromatogram picture embedded in a report xlsx by OpenLab/Excel's
// default clipboard paste is a Windows EMF metafile, not a PNG — nothing
// server-side can rasterize that (this app runs on Cloudflare Workers, no
// native image tools available). A small Windows agent on the lab PC that
// produces the xlsx watches for new reports, converts the embedded EMF to
// PNG with .NET's own GDI+ (System.Drawing.Imaging.Metafile — the same
// renderer Windows already uses to display it correctly), and writes it
// as a sibling "<report>.chromatogram.png" next to the report in the same
// Drive folder rather than rewriting the xlsx's internal zip structure.
// This looks that sibling up and inlines it as a data URI for the partner
// COA payload — best-effort, since a missing/failed conversion should
// never block parsing or saving the report's actual results.
function chromatogramSiblingName(reportFileName: string): string {
  return reportFileName.replace(/\.[^.]+$/, "") + ".chromatogram.png";
}

export async function findChromatogramImage(folderId: string, reportFileName: string): Promise<string | null> {
  try {
    const siblingName = chromatogramSiblingName(reportFileName).replace(/'/g, "\\'");
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and name = '${siblingName}'`);
    const fields = encodeURIComponent("files(id,name)");
    const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=1`, { headers: gatewayHeaders() });
    if (!r.ok) return null;
    const json = (await r.json()) as { files?: Array<{ id: string; name: string }> };
    const file = json.files?.[0];
    if (!file) return null;
    const bytes = await driveDownload(file.id);
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function loadReportsFolderId(supabase: import("@supabase/supabase-js").SupabaseClient): Promise<string> {
  const { data } = await supabase.from("sp_settings").select("drive_lm_reports_complete_folder_id").eq("id", true).maybeSingle();
  const folderId = data?.drive_lm_reports_complete_folder_id;
  if (!folderId) throw new Error("LM-Reports Complete Drive folder is not configured. Set it in Sample Prep → Settings first.");
  return folderId;
}

export const listReportFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const folderId = await loadReportsFolderId(context.supabase);
    const files = await driveList(folderId);
    return files.map((f) => ({ id: f.id, name: f.name, modified_time: f.modifiedTime ?? null }));
  });

export type ParsedReportCompound = {
  compound: string;
  rt: number;
  area: number | null;
  amount_per_vial_mg: number | null;
  percent_label_claim: number | null;
  purity_pct: number | null;
  unparsed_tail?: string;
};

export type ParsedReport = {
  file_id: string;
  file_name: string;
  sample_id_in_report: string | null;
  analysis_date: string | null;
  total_peptide_contents_mg: number | null;
  compounds: ParsedReportCompound[];
  raw_text: string;
  chromatogram_image: string | null;
};

function numField(s: string): number | null {
  return s === "N/A" ? null : Number(s);
}
function pctField(s: string): number | null {
  return s === "N/A" ? null : Number(s.replace(/^[<>]/, "").replace(/%$/, ""));
}

const AMOUNT_RE = String.raw`(N/A|\d+\.\d{3})`;
const PCT_RE = String.raw`(N/A|[<>]?\d+\.\d{2}%)`;
const FIVE_FIELD = new RegExp(`^${AMOUNT_RE}${AMOUNT_RE}${PCT_RE}${PCT_RE}$`);
const FOUR_FIELD = new RegExp(`^${AMOUNT_RE}${PCT_RE}${PCT_RE}$`);

function parseCompoundLine(line: string): ParsedReportCompound | null {
  // RT is the one reliably fixed-format token: single digit, decimal
  // point, exactly 3 digits. Everything before its first occurrence is
  // the compound name (which may itself contain digits, e.g. "BPC-157").
  const m = line.match(/^([A-Za-z][A-Za-z0-9+\-]*?)(\d\.\d{3})(.+)$/);
  if (!m) return null;
  const [, compound, rtStr, tail] = m;
  const rt = Number(rtStr);

  const five = tail.match(FIVE_FIELD);
  if (five) {
    const [, area, amount, labelClaim, purity] = five;
    return {
      compound, rt, area: numField(area), amount_per_vial_mg: numField(amount),
      percent_label_claim: pctField(labelClaim), purity_pct: pctField(purity),
    };
  }
  const four = tail.match(FOUR_FIELD);
  if (four) {
    const [, amount, labelClaim, purity] = four;
    return {
      compound, rt, area: null, amount_per_vial_mg: numField(amount),
      percent_label_claim: pctField(labelClaim), purity_pct: pctField(purity),
    };
  }
  // Row shape didn't match either known template — still surface the
  // compound name/RT we're confident about, flag the rest for manual entry.
  return { compound, rt, area: null, amount_per_vial_mg: null, percent_label_claim: null, purity_pct: null, unparsed_tail: tail };
}

/**
 * Older report template ("Single Injection Report" / per-injection
 * calibration report, used roughly through 2026-07-23 before the lab
 * switched to the "Single-Analyte Assay Report" table template the parser
 * above targets) — confirmed by pulling and diffing real report PDFs from
 * both eras during the first live reconciliation run, which failed to
 * parse any pre-switch file. Fields are scattered label:value pairs
 * instead of a squished table row, e.g.:
 *   "Sample name:SYX-000002-02 / Lot RGIC-SS31-50-070826"
 *   "Purity99.27%"
 *   "Net Peptide Content54.807 mg/vialInjection date:2026-07-22 21:04:50-07:00"
 *   "% of Label Claim109.61%Location:D2F-A5"
 *   "Compound:SS-31 (DAD1A)"
 *   "Exp. RT:5.208"
 */
function parseSingleInjectionReport(text: string): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image"> | null {
  if (!/Single Injection Report/.test(text)) return null;
  const sampleIdMatch = text.match(/Sample name:\s*([A-Za-z0-9-]+)/);
  const purityMatch = text.match(/Purity\s*([<>]?\d+\.\d{2})%/);
  const netContentMatch = text.match(/Net Peptide Content\s*(\d+\.\d+)\s*mg\/vial/);
  const injectionDateMatch = text.match(/Injection date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[^\n%]*)/);
  const labelClaimMatch = text.match(/% of Label Claim\s*(\d+\.\d{2})%/);
  const compoundMatch = text.match(/Compound:\s*([A-Za-z0-9+\-]+)/);
  const rtMatch = text.match(/Exp\.\s*RT:\s*(\d+\.\d{3})/);
  if (!purityMatch || !compoundMatch) return null;

  const compound: ParsedReportCompound = {
    compound: compoundMatch[1],
    rt: rtMatch ? Number(rtMatch[1]) : 0,
    area: null,
    amount_per_vial_mg: netContentMatch ? Number(netContentMatch[1]) : null,
    percent_label_claim: labelClaimMatch ? Number(labelClaimMatch[1]) : null,
    purity_pct: Number(purityMatch[1].replace(/^[<>]/, "")),
  };

  return {
    sample_id_in_report: sampleIdMatch ? sampleIdMatch[1].trim() : null,
    analysis_date: injectionDateMatch ? injectionDateMatch[1].trim() : null,
    total_peptide_contents_mg: null,
    compounds: [compound],
  };
}

export function parseReportText(text: string): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image"> {
  const sampleIdMatch = text.match(/Sample ID:\s*([^\n]+?)(?:Analyte:|Product:|\n)/);
  const analysisDateMatch = text.match(/Analysis date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[^\n]*?)(?:Report|\n)/);
  const totalMatch = text.match(/Total Peptide Contents:\s*([\d.]+)\s*mg/i);
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const compounds: ParsedReportCompound[] = [];
  for (const line of lines) {
    if (/^Compound(Not Found|RT)/.test(line)) continue; // header row or "Compound Not Found" row
    const parsed = parseCompoundLine(line);
    if (parsed) compounds.push(parsed);
  }
  if (compounds.length === 0) {
    const legacy = parseSingleInjectionReport(text);
    if (legacy) return legacy;
  }
  return {
    sample_id_in_report: sampleIdMatch ? sampleIdMatch[1].trim() : null,
    analysis_date: analysisDateMatch ? analysisDateMatch[1].trim() : null,
    total_peptide_contents_mg: totalMatch ? Number(totalMatch[1]) : null,
    compounds,
  };
}

/**
 * .xlsx counterpart to parseReportText, for once report generation moves
 * off PDF. Built without a real sample export to test against yet — it's
 * deliberately header-driven (scans every row for a header containing
 * recognizable column names, rather than assuming a fixed row/column
 * layout) and scans all cells for "Sample ID"/"Analysis date"-style
 * labels, so it isn't tied to exact positioning. Once real exports exist,
 * cross-check this against them the same way parseReportText was
 * validated against real PDFs, and adjust the column aliases below.
 */
const XLSX_COLUMN_ALIASES: Record<keyof Pick<ParsedReportCompound, "compound" | "rt" | "area" | "amount_per_vial_mg" | "percent_label_claim" | "purity_pct">, string[]> = {
  compound: ["compound", "analyte", "identity"],
  rt: ["rt", "rt [min]", "retention time"],
  area: ["area"],
  amount_per_vial_mg: ["amount/vial", "amount/vial [mg]", "amount [mg]", "amount per vial"],
  percent_label_claim: ["% label claim", "label claim", "%labelclaim"],
  purity_pct: ["purity %", "purity", "area purity %", "area %"],
};

const LABEL_ALIASES: Record<"sample_id" | "analysis_date", string[]> = {
  sample_id: ["sample id", "sample name"],
  analysis_date: ["analysis date", "injection date"],
};

function cellText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function findXlsxHeaderRow(rows: unknown[][]): { rowIdx: number; colMap: Partial<Record<keyof typeof XLSX_COLUMN_ALIASES, number>> } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] ?? []).map((c) => cellText(c).toLowerCase());
    const colMap: Partial<Record<keyof typeof XLSX_COLUMN_ALIASES, number>> = {};
    for (const [key, aliases] of Object.entries(XLSX_COLUMN_ALIASES) as [keyof typeof XLSX_COLUMN_ALIASES, string[]][]) {
      const idx = row.findIndex((cell) => aliases.some((a) => cell === a || cell.startsWith(a)));
      if (idx !== -1) colMap[key] = idx;
    }
    // A real header row needs at minimum a compound name and RT column.
    if (colMap.compound !== undefined && colMap.rt !== undefined) return { rowIdx: i, colMap };
  }
  return null;
}

function findLabelValue(rows: unknown[][], aliases: string[]): string | null {
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = cellText(row[c]).toLowerCase().replace(/:$/, "");
      if (aliases.some((a) => cell === a)) {
        const next = cellText(row[c + 1]);
        if (next) return next;
      }
    }
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^N\/A$/i.test(s)) return null;
  const n = Number(s.replace(/^[<>]/, "").replace(/%$/, ""));
  return isNaN(n) ? null : n;
}

function xlsxRowsFromBuffer(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
}

function parseXlsxRows(rows: unknown[][]): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image"> {
  const header = findXlsxHeaderRow(rows);
  const compounds: ParsedReportCompound[] = [];
  if (header) {
    for (let i = header.rowIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const compoundName = cellText(row[header.colMap.compound as number]);
      if (!compoundName || /not (found|detected)/i.test(compoundName)) continue;
      const rt = header.colMap.rt !== undefined ? numOrNull(row[header.colMap.rt]) : null;
      if (rt === null) continue; // no RT means nothing quantitative on this row
      compounds.push({
        compound: compoundName,
        rt,
        area: header.colMap.area !== undefined ? numOrNull(row[header.colMap.area]) : null,
        amount_per_vial_mg: header.colMap.amount_per_vial_mg !== undefined ? numOrNull(row[header.colMap.amount_per_vial_mg]) : null,
        percent_label_claim: header.colMap.percent_label_claim !== undefined ? numOrNull(row[header.colMap.percent_label_claim]) : null,
        purity_pct: header.colMap.purity_pct !== undefined ? numOrNull(row[header.colMap.purity_pct]) : null,
      });
    }
  }

  return {
    sample_id_in_report: findLabelValue(rows, LABEL_ALIASES.sample_id),
    analysis_date: findLabelValue(rows, LABEL_ALIASES.analysis_date),
    total_peptide_contents_mg: null,
    compounds,
  };
}

export function parseXlsxReport(buffer: Buffer): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image"> {
  return parseXlsxRows(xlsxRowsFromBuffer(buffer));
}

function isXlsxFile(fileName: string): boolean {
  return /\.xlsx?$/i.test(fileName);
}

/**
 * Single entry point both the picker dialog and bulk reconciliation call —
 * picks the PDF or Excel parser by file extension so the rest of the
 * pipeline (compoundsToPeaks, result insertion) never needs to know which
 * format a given report came in as.
 */
export async function parseReportBuffer(bytes: ArrayBuffer, fileName: string): Promise<Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image"> & { raw_text: string }> {
  if (isXlsxFile(fileName)) {
    const rows = xlsxRowsFromBuffer(Buffer.from(bytes));
    return { ...parseXlsxRows(rows), raw_text: JSON.stringify(rows) };
  }
  const { text } = await pdfParse(Buffer.from(bytes));
  return { ...parseReportText(text), raw_text: text };
}

/**
 * Maps a parsed report's compound rows to Peak[] + the sample's overall
 * purity (the peak with the highest area_pct) — shared by the single-file
 * picker dialog and the bulk reconciliation path so both save results the
 * same way.
 */
export function compoundsToPeaks(compounds: ParsedReportCompound[]): { peaks: Peak[]; purity: number } {
  const peaks: Peak[] = compounds.map((c, i) => ({
    peak_id: `P${i + 1}`, rt: c.rt, area: c.area ?? 0, area_pct: c.purity_pct ?? 0,
    identity: c.compound, amount_per_vial_mg: c.amount_per_vial_mg, percent_label_claim: c.percent_label_claim,
  }));
  const main = peaks.reduce((a, b) => (b.area_pct > (a?.area_pct ?? 0) ? b : a), peaks[0]);
  return { peaks, purity: main?.area_pct ?? 0 };
}

export const parseReportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().min(1), file_name: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const bytes = await driveDownload(data.file_id);
    const { raw_text: text, ...parsed } = await parseReportBuffer(bytes, data.file_name);
    // Normalize the report's "Analysis date:" text into a real timestamp
    // so it can be saved verbatim — the raw extracted string is usually
    // Postgres-parseable already (e.g. "2026-08-03 21:35:13-07:00") but
    // isn't strictly ISO 8601, so round-trip it through Date first.
    const analysisDate = (() => {
      if (!parsed.analysis_date) return null;
      const d = new Date(parsed.analysis_date);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })();
    const folderId = await loadReportsFolderId(context.supabase);
    const chromatogramImage = await findChromatogramImage(folderId, data.file_name);
    return {
      file_id: data.file_id, file_name: data.file_name, raw_text: text, ...parsed,
      analysis_date: analysisDate, chromatogram_image: chromatogramImage,
    };
  });

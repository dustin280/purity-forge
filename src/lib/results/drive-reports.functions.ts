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
function siblingName(reportFileName: string, suffix: string): string {
  return reportFileName.replace(/\.[^.]+$/, "") + suffix;
}

async function findSiblingImage(folderId: string, reportFileName: string, suffix: string): Promise<string | null> {
  try {
    const name = siblingName(reportFileName, suffix).replace(/'/g, "\\'");
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and name = '${name}'`);
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

export async function findChromatogramImage(folderId: string, reportFileName: string): Promise<string | null> {
  return findSiblingImage(folderId, reportFileName, ".chromatogram.png");
}

// Second embedded picture in the report — the calibration curve chart from
// the "Calibration Update" block, converted by the same lab-PC agent
// alongside the chromatogram. Absent (returns null) on reports predating
// that report-template change or older ChromatogramConverter versions that
// only extracted the first embedded picture — never blocks parsing.
export async function findCalibrationImage(folderId: string, reportFileName: string): Promise<string | null> {
  return findSiblingImage(folderId, reportFileName, ".calibration.png");
}

// A blend report gets one calibration image per compound (the fixed
// ChromatogramConverter -- see tools/chromatogram-converter -- names them
// "<report>.calibration.<Compound>.png"), falling back to the single flat
// "<report>.calibration.png" name when there's only one curve. Lists every
// sibling matching the calibration prefix rather than assuming a filename,
// since older/simple reports and reports with a resolvable-vs-unresolvable
// compound label produce different name shapes.
async function findCalibrationImages(folderId: string, reportFileName: string): Promise<Array<{ compound: string | null; image: string }>> {
  const stem = reportFileName.replace(/\.[^.]+$/, "");
  const prefix = `${stem}.calibration`;
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and name contains '${prefix.replace(/'/g, "\\'")}'`);
    const fields = encodeURIComponent("files(id,name)");
    const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=50`, { headers: gatewayHeaders() });
    if (!r.ok) return [];
    const json = (await r.json()) as { files?: Array<{ id: string; name: string }> };
    const matches = (json.files ?? []).filter((f) => f.name.startsWith(prefix) && f.name.toLowerCase().endsWith(".png"));
    const results = await Promise.all(matches.map(async (f) => {
      const bytes = await driveDownload(f.id);
      const image = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
      // "<stem>.calibration.png" (flat, single curve) vs
      // "<stem>.calibration.<Compound>.png" (per-compound, multiple curves).
      const rest = f.name.slice(prefix.length).replace(/\.png$/i, "");
      const compound = rest.startsWith(".") ? rest.slice(1) : null;
      return { compound: compound || null, image };
    }));
    return results;
  } catch {
    return [];
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
  // Xlsx-report-only fields (null from the PDF parsers, which have no
  // equivalent columns) — response factor, raw detector peak height,
  // calibration-curve concentration, spectral peak-purity score/pass flag,
  // and UV spectral match, all straight off the instrument's per-peak table.
  rf: number | null;
  peak_height_mau: number | null;
  concentration_mg: number | null;
  peak_purity: number | null;
  peak_purity_passed: boolean | null;
  uv_match: number | null;
  wavelength_nm: number | null;
  unparsed_tail?: string;
};

// The "Calibration Update" block the report template added below the
// compound table — fit stats for the calibration curve chart embedded as
// the report's second picture (see findCalibrationImage). Absent (null)
// on older reports/report templates without this block.
export type CalibrationData = {
  calibration_update: string | null;
  compound: string | null;
  exp_rt: number | null;
  residual_std: number | null;
  r: number | null;
  r_squared: number | null;
  formula: string | null;
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  scaled_label: string | null;
  scaled_type: string | null;
};

// One compound's calibration curve, image + fit stats merged together (by
// compound name) from the two independent sources they come from — the
// image is a Drive sibling written by the chromatogram-converter agent,
// the fit stats are parsed straight out of the xlsx's own cells.
export type CalibrationCurve = {
  compound: string | null;
  image: string | null;
  data: CalibrationData | null;
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
  // Singular fields kept for backward compatibility (partner export API,
  // older UI code) -- always the first/primary curve. calibration_curves
  // carries the full per-compound set for blend reports (SUMMIT etc.).
  calibration_image: string | null;
  calibration_data: CalibrationData | null;
  calibration_data_blocks: CalibrationData[];
  calibration_curves: CalibrationCurve[];
  // Report-header label:value pairs that don't belong to any one compound
  // row (data file, operator, instrument, injection volume, location,
  // acquisition/processing method, signal, etc.) — xlsx reports only, null
  // from the PDF parsers.
  report_metadata: Record<string, string> | null;
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

  // Xlsx-only fields have no PDF equivalent — always null from this parser.
  const noXlsxFields = {
    rf: null, peak_height_mau: null, concentration_mg: null,
    peak_purity: null, peak_purity_passed: null, uv_match: null, wavelength_nm: null,
  } as const;

  const five = tail.match(FIVE_FIELD);
  if (five) {
    const [, area, amount, labelClaim, purity] = five;
    return {
      compound, rt, area: numField(area), amount_per_vial_mg: numField(amount),
      percent_label_claim: pctField(labelClaim), purity_pct: pctField(purity), ...noXlsxFields,
    };
  }
  const four = tail.match(FOUR_FIELD);
  if (four) {
    const [, amount, labelClaim, purity] = four;
    return {
      compound, rt, area: null, amount_per_vial_mg: numField(amount),
      percent_label_claim: pctField(labelClaim), purity_pct: pctField(purity), ...noXlsxFields,
    };
  }
  // Row shape didn't match either known template — still surface the
  // compound name/RT we're confident about, flag the rest for manual entry.
  return { compound, rt, area: null, amount_per_vial_mg: null, percent_label_claim: null, purity_pct: null, ...noXlsxFields, unparsed_tail: tail };
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
function parseSingleInjectionReport(text: string): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image" | "calibration_image" | "calibration_curves"> | null {
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
    rf: null, peak_height_mau: null, concentration_mg: null,
    peak_purity: null, peak_purity_passed: null, uv_match: null, wavelength_nm: null,
  };

  return {
    sample_id_in_report: sampleIdMatch ? sampleIdMatch[1].trim() : null,
    analysis_date: injectionDateMatch ? injectionDateMatch[1].trim() : null,
    total_peptide_contents_mg: null,
    compounds: [compound],
    calibration_data: null,
    calibration_data_blocks: [],
    report_metadata: null,
  };
}

export function parseReportText(text: string): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image" | "calibration_image" | "calibration_curves"> {
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
    calibration_data: null,
    calibration_data_blocks: [],
    report_metadata: null,
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
const XLSX_COLUMN_ALIASES: Record<keyof Pick<ParsedReportCompound, "compound" | "rt" | "area" | "amount_per_vial_mg" | "percent_label_claim" | "purity_pct" | "rf" | "peak_height_mau" | "concentration_mg" | "peak_purity" | "peak_purity_passed" | "uv_match" | "wavelength_nm">, string[]> = {
  // "Peak Assignment" is the multi-compound blend-report template's name
  // for this column (e.g. SUMMIT's 4-compound table) — single-analyte
  // reports use "Compound"/"Analyte"/etc, both need to resolve here.
  compound: ["compound", "analyte", "identity", "name", "peak assignment"],
  rt: ["rt", "rt [min]", "retention time"],
  area: ["area"],
  amount_per_vial_mg: ["amount/vial", "amount/vial [mg]", "amount [mg]", "amount per vial"],
  percent_label_claim: ["% label claim", "label claim", "%labelclaim"],
  // Blend-report template has no column literally called "Purity %" — "DAD
  // Peak Purity [%]" is the right per-compound purity source there (same
  // spectral-purity concept peak_purity below reads); "Blend UV Purity" is
  // explicitly NOT component-specific per that report's own Signal note,
  // so it's deliberately not aliased here.
  purity_pct: ["purity %", "purity", "area purity %", "area %", "dad peak purity"],
  rf: ["rf"],
  peak_height_mau: ["peak height [mau]", "peak height", "height"],
  concentration_mg: ["concentration [mg]", "concentration"],
  peak_purity: ["peak purity", "dad peak purity"],
  peak_purity_passed: ["peak purity passed", "dad purity pass"],
  uv_match: ["uv match [0-1000]", "uv match"],
  wavelength_nm: ["λ [nm]", "wavelength [nm]", "wavelength"],
};

const LABEL_ALIASES: Record<"sample_id" | "analysis_date", string[]> = {
  sample_id: ["sample id", "sample name"],
  analysis_date: ["analysis date", "injection date"],
};

// Report-header label:value pairs, keyed for report_metadata. "type" is
// deliberately last/specific-enough for this template — every other alias
// here only appears once on the sheet as an actual field label.
const REPORT_METADATA_LABEL_ALIASES: Record<string, string[]> = {
  data_file: ["data file"],
  operator: ["operator"],
  instrument: ["instrument"],
  injection_volume: ["inj. volume", "injection volume"],
  location: ["location"],
  acquisition_method: ["acq. method", "acquisition method"],
  processing_method: ["processing method"],
  sample_amount: ["sample amount"],
  sample_type: ["type"],
  signal: ["signal"],
  calib_level: ["calib level"],
  manually_modified: ["manually modified"],
};

// The "Calibration Update" block the report template added below the
// compound table — same label:value layout (and same rightward-scan
// findLabelValue handles) as the report-header fields above, just further
// down the sheet. "r" alone as a label is unusual enough elsewhere in a
// chromatography report that an exact-match lookup here is safe.
const CALIBRATION_LABEL_ALIASES: Record<keyof CalibrationData, string[]> = {
  calibration_update: ["calibration update"],
  compound: ["compound"],
  exp_rt: ["exp. rt", "exp rt"],
  residual_std: ["residual std"],
  r: ["r"],
  r_squared: ["r^2", "r²"],
  formula: ["formula"],
  a: ["a"],
  b: ["b"],
  c: ["c"],
  d: ["d"],
  scaled_label: ["scaled label"],
  scaled_type: ["scaled type"],
};

function findCalibrationDataInRange(rows: unknown[][]): CalibrationData | null {
  const str = (key: keyof typeof CALIBRATION_LABEL_ALIASES) => findLabelValue(rows, CALIBRATION_LABEL_ALIASES[key]);
  const num = (key: keyof typeof CALIBRATION_LABEL_ALIASES) => numOrNull(str(key));
  const calibrationUpdate = str("calibration_update");
  const compound = str("compound");
  if (calibrationUpdate == null && compound == null) return null;
  return {
    calibration_update: calibrationUpdate,
    compound,
    exp_rt: num("exp_rt"),
    residual_std: num("residual_std"),
    r: num("r"),
    r_squared: num("r_squared"),
    formula: str("formula"),
    a: num("a"),
    b: num("b"),
    c: num("c"),
    d: num("d"),
    scaled_label: str("scaled_label"),
    scaled_type: str("scaled_type"),
  };
}

// A blend report has one calibration block per compound (confirmed against
// a real 4-compound SUMMIT report: four "Compound:" cells, ~15 rows apart,
// each starting its own Exp. RT/Residual STD/R/R²/Formula/a-d block). Each
// block is delimited by its "Compound:" row through the row before the
// next one (or end of sheet for the last block). Older/simpler reports
// with no per-compound "Compound:" label at all fall back to scanning the
// whole sheet as a single block, same as the original single-block
// behavior — returns [] (not null) when there's no calibration block at
// all, e.g. older reports/report templates predating this addition.
function findCalibrationDataBlocks(rows: unknown[][]): CalibrationData[] {
  const starts: number[] = [];
  rows.forEach((row, i) => {
    if ((row ?? []).some((cell) => normKey(cellText(cell).replace(/:$/, "")) === normKey("compound"))) starts.push(i);
  });
  if (starts.length === 0) {
    const single = findCalibrationDataInRange(rows);
    return single ? [single] : [];
  }
  const blocks: CalibrationData[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : rows.length;
    const block = findCalibrationDataInRange(rows.slice(from, to));
    if (block) blocks.push(block);
  }
  return blocks;
}

function cellText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// Excel wraps long header text (e.g. "Amount/Vial [mg]") at arbitrary
// points, embedding a literal \r\n mid-word ("Amount/Vi\r\nal [mg]") —
// collapsing runs of whitespace to a single space still leaves "vi al"
// instead of "vial", so alias matching strips whitespace entirely from
// both sides instead of just lowercasing.
function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function findAliasColIndex(normalizedRow: string[], aliases: string[]): number | undefined {
  const idx = normalizedRow.findIndex((cell) => aliases.some((a) => cell === normKey(a) || cell.startsWith(normKey(a))));
  return idx === -1 ? undefined : idx;
}

// "Blend UV Purity" / "UV Area % (Blend)" are deliberately excluded from
// purity_pct's own aliases above (see that comment) -- "DAD Peak Purity" is
// the right per-compound spectral-purity source when it's present. But it
// reads "N/A" for any peak with no compound match to score against --
// confirmed both for a single-compound sample run on the blend-capable
// template where DAD purity is N/A for the whole acquisition (2026-08-25,
// SYX-000005-06/TB500 on "*BPC-157 TB500 Blend 6 Cal") and, separately, for
// a genuine unassigned/uncalibrated peak sitting alongside an otherwise
// normal identified-compound row (confirmed against two real exports,
// 2026-08-27/SYX-000006-01/BPC-157 and 2026-08-25/SYX-000005-02/CJC-1295+
// Ipamorelin: "UV Area % (Blend)" holds real, distinct per-peak values that
// sum to 100% across every row, while "Blend UV Purity" is a SEPARATE
// column on the same sheet that's blank on every row in both exports).
// These are two different columns, not alternate names for one column --
// treating them as interchangeable aliases into a single lookup let
// "Blend UV Purity" (blank, and positioned earlier in the row) win over
// "UV Area % (Blend)" (the one with real data) purely by column order.
// Looked up separately below; "Blend UV Purity" is only used as a
// last-resort in case some report variant carries real data under that
// name instead -- unverified, kept only because it's harmless when unused.
const UV_AREA_PCT_BLEND_ALIASES = ["uv area % (blend)"];
const BLEND_UV_PURITY_FALLBACK_ALIASES = ["blend uv purity"];

function findXlsxHeaderRow(rows: unknown[][]): { rowIdx: number; colMap: Partial<Record<keyof typeof XLSX_COLUMN_ALIASES, number>>; blendUvPurityCol: number | undefined } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] ?? []).map((c) => normKey(cellText(c)));
    const colMap: Partial<Record<keyof typeof XLSX_COLUMN_ALIASES, number>> = {};
    for (const [key, aliases] of Object.entries(XLSX_COLUMN_ALIASES) as [keyof typeof XLSX_COLUMN_ALIASES, string[]][]) {
      const idx = findAliasColIndex(row, aliases);
      if (idx !== undefined) colMap[key] = idx;
    }
    // A real header row needs at minimum a compound name and RT column.
    if (colMap.compound !== undefined && colMap.rt !== undefined) {
      const blendUvPurityCol = findAliasColIndex(row, UV_AREA_PCT_BLEND_ALIASES) ?? findAliasColIndex(row, BLEND_UV_PURITY_FALLBACK_ALIASES);
      return { rowIdx: i, colMap, blendUvPurityCol };
    }
  }
  return null;
}

function findLabelValue(rows: unknown[][], aliases: string[]): string | null {
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = normKey(cellText(row[c]).replace(/:$/, ""));
      if (aliases.some((a) => cell === normKey(a))) {
        // The report template pads a label with several blank merged-cell
        // columns before its actual value (e.g. "Sample name:" at column 1,
        // value at column 7) — the immediate next cell is usually empty, so
        // scan rightward for the first non-blank cell instead. But some
        // labels (e.g. "Calib Level:") are legitimately blank for a given
        // sample, with another label sharing the row further right (e.g.
        // "Sample amount:") — stop at the first cell that itself looks like
        // a label rather than treating it as this label's value.
        for (let k = c + 1; k < row.length; k++) {
          const next = cellText(row[k]);
          if (!next) continue;
          if (/:$/.test(next)) break;
          return next;
        }
      }
    }
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  // Excel wraps a narrow numeric column's value across lines just like it
  // does header text (see normKey above) -- confirmed real data:
  // "Blend UV Purity" for a real report came through as "100.0\r\n0%",
  // which plain trim() leaves broken mid-token. Strip all whitespace, not
  // just leading/trailing.
  const s = String(v).replace(/\s+/g, "");
  if (/^N\/A$/i.test(s)) return null;
  const n = Number(s.replace(/^[<>]/, "").replace(/%$/, ""));
  return isNaN(n) ? null : n;
}

function boolOrNull(v: unknown): boolean | null {
  const s = cellText(v).toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

function findReportMetadata(rows: unknown[][]): Record<string, string> | null {
  const metadata: Record<string, string> = {};
  for (const [key, aliases] of Object.entries(REPORT_METADATA_LABEL_ALIASES)) {
    const value = findLabelValue(rows, aliases);
    if (value) metadata[key] = value;
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

// Newer report templates split a blend's per-compound calibration blocks
// onto a second worksheet ("Page 2") while the compound table/chromatogram
// stay on the first ("Page 1") — reading only SheetNames[0] silently missed
// every calibration block on those reports (confirmed against a real
// SUMMIT report: "Compound:"/"Exp. RT:"/etc. exist only on Page 2). All
// sheets are concatenated in workbook order; single-sheet (older/simple)
// reports are unaffected since there's nothing to add.
function xlsxRowsFromBuffer(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" }));
}

function parseXlsxRows(rows: unknown[][]): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image" | "calibration_image" | "calibration_curves"> {
  const header = findXlsxHeaderRow(rows);
  const compounds: ParsedReportCompound[] = [];
  if (header) {
    for (let i = header.rowIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const compoundName = cellText(row[header.colMap.compound as number]);
      if (!compoundName || /not (found|detected)/i.test(compoundName)) continue;
      const rt = header.colMap.rt !== undefined ? numOrNull(row[header.colMap.rt]) : null;
      if (rt === null) continue; // no RT means nothing quantitative on this row
      let purityPct = header.colMap.purity_pct !== undefined ? numOrNull(row[header.colMap.purity_pct]) : null;
      // No DAD purity of its own (no compound match to score spectrally
      // against -- an unassigned peak, or an acquisition where it wasn't
      // computed at all) -- fall back to this row's own UV Area %/Blend UV
      // Purity value, a real per-peak area share (see BLEND_UV_PURITY_ALIASES
      // comment above), rather than leaving it null/0.
      if (purityPct == null && header.blendUvPurityCol !== undefined) {
        purityPct = numOrNull(row[header.blendUvPurityCol]);
      }
      compounds.push({
        compound: compoundName,
        rt,
        area: header.colMap.area !== undefined ? numOrNull(row[header.colMap.area]) : null,
        amount_per_vial_mg: header.colMap.amount_per_vial_mg !== undefined ? numOrNull(row[header.colMap.amount_per_vial_mg]) : null,
        percent_label_claim: header.colMap.percent_label_claim !== undefined ? numOrNull(row[header.colMap.percent_label_claim]) : null,
        purity_pct: purityPct,
        rf: header.colMap.rf !== undefined ? numOrNull(row[header.colMap.rf]) : null,
        peak_height_mau: header.colMap.peak_height_mau !== undefined ? numOrNull(row[header.colMap.peak_height_mau]) : null,
        concentration_mg: header.colMap.concentration_mg !== undefined ? numOrNull(row[header.colMap.concentration_mg]) : null,
        peak_purity: header.colMap.peak_purity !== undefined ? numOrNull(row[header.colMap.peak_purity]) : null,
        peak_purity_passed: header.colMap.peak_purity_passed !== undefined ? boolOrNull(row[header.colMap.peak_purity_passed]) : null,
        uv_match: header.colMap.uv_match !== undefined ? numOrNull(row[header.colMap.uv_match]) : null,
        wavelength_nm: header.colMap.wavelength_nm !== undefined ? numOrNull(row[header.colMap.wavelength_nm]) : null,
      });
    }
  }

  const calibrationBlocks = findCalibrationDataBlocks(rows);
  return {
    sample_id_in_report: findLabelValue(rows, LABEL_ALIASES.sample_id),
    analysis_date: findLabelValue(rows, LABEL_ALIASES.analysis_date),
    total_peptide_contents_mg: null,
    compounds,
    // Singular field kept for backward compatibility (partner API, older UI
    // paths) -- the first/primary block. calibration_data_blocks below
    // carries the full per-compound set for blend reports.
    calibration_data: calibrationBlocks[0] ?? null,
    calibration_data_blocks: calibrationBlocks,
    report_metadata: findReportMetadata(rows),
  };
}

export function parseXlsxReport(buffer: Buffer): Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image" | "calibration_image" | "calibration_curves"> {
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
export async function parseReportBuffer(bytes: ArrayBuffer, fileName: string): Promise<Omit<ParsedReport, "file_id" | "file_name" | "raw_text" | "chromatogram_image" | "calibration_image" | "calibration_curves"> & { raw_text: string }> {
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
export function compoundsToPeaks(compounds: ParsedReportCompound[]): { peaks: Peak[]; purity: number; uv_conf_match: number | null; wavelength_nm: number | null } {
  const peaks: Peak[] = compounds.map((c, i) => ({
    peak_id: `P${i + 1}`, rt: c.rt, area: c.area ?? null, area_pct: c.purity_pct ?? 0,
    identity: c.compound, amount_per_vial_mg: c.amount_per_vial_mg, percent_label_claim: c.percent_label_claim,
    height: c.peak_height_mau, rf: c.rf, concentration_mg: c.concentration_mg,
    peak_purity: c.peak_purity, peak_purity_passed: c.peak_purity_passed,
    uv_match: c.uv_match, wavelength_nm: c.wavelength_nm,
  }));
  const main = peaks.reduce((a, b) => (b.area_pct > (a?.area_pct ?? 0) ? b : a), peaks[0]);
  // results.uv_conf_match/wavelength_nm are single columns per result (not
  // per-peak) — sourced from the same main/purity peak used for the overall
  // purity number, same convention as chromatogram_image.
  return {
    peaks, purity: main?.area_pct ?? 0,
    uv_conf_match: main?.uv_match ?? null, wavelength_nm: main?.wavelength_nm ?? null,
  };
}

// Matches each Drive calibration image to its xlsx-parsed fit-stats block
// by compound name -- the two are independent sources (image comes from a
// sibling PNG file, data from the report's own cells) that need reuniting.
// Names are normalized (lowercased, trimmed, detector-channel tag like
// "(DAD1A)" stripped) since the xlsx text still carries that tag while the
// image filename (sanitized by the converter) doesn't.
function normalizeCompoundKey(name: string | null): string | null {
  if (!name) return null;
  const noTag = name.replace(/\([^)]*\)\s*$/, "").trim();
  return noTag ? noTag.toLowerCase() : null;
}

function mergeCalibrationCurves(
  images: Array<{ compound: string | null; image: string }>,
  dataBlocks: CalibrationData[],
): CalibrationCurve[] {
  if (images.length <= 1 && dataBlocks.length <= 1) {
    if (images.length === 0 && dataBlocks.length === 0) return [];
    return [{
      compound: dataBlocks[0]?.compound ?? images[0]?.compound ?? null,
      image: images[0]?.image ?? null,
      data: dataBlocks[0] ?? null,
    }];
  }
  const dataByKey = new Map<string, CalibrationData>();
  for (const d of dataBlocks) {
    const key = normalizeCompoundKey(d.compound);
    if (key) dataByKey.set(key, d);
  }
  const curves: CalibrationCurve[] = [];
  const usedKeys = new Set<string>();
  for (const img of images) {
    const key = normalizeCompoundKey(img.compound);
    const data = key ? dataByKey.get(key) ?? null : null;
    if (key) usedKeys.add(key);
    curves.push({ compound: data?.compound ?? img.compound, image: img.image, data });
  }
  for (const d of dataBlocks) {
    const key = normalizeCompoundKey(d.compound);
    if (key && usedKeys.has(key)) continue;
    curves.push({ compound: d.compound, image: null, data: d });
  }
  return curves;
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
    const [chromatogramImage, calibrationImages] = await Promise.all([
      findChromatogramImage(folderId, data.file_name),
      findCalibrationImages(folderId, data.file_name),
    ]);
    const calibrationCurves = mergeCalibrationCurves(calibrationImages, parsed.calibration_data_blocks);
    return {
      file_id: data.file_id, file_name: data.file_name, raw_text: text, ...parsed,
      analysis_date: analysisDate, chromatogram_image: chromatogramImage,
      // Singular fields (back-compat): first/primary curve.
      calibration_image: calibrationCurves[0]?.image ?? null,
      calibration_data: calibrationCurves[0]?.data ?? parsed.calibration_data,
      calibration_curves: calibrationCurves,
    };
  });

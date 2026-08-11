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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as pdfParseModule from "pdf-parse";
// pdf-parse is CJS (`module.exports = function`) — depending on how the
// SSR bundler interops it, the namespace import is either directly
// callable or has the function on `.default`. Handle both at runtime
// rather than assuming one shape.
type PdfParseFn = (data: Buffer) => Promise<{ text: string }>;
const pdfParse: PdfParseFn = typeof pdfParseModule === "function"
  ? (pdfParseModule as unknown as PdfParseFn)
  : (pdfParseModule as unknown as { default: PdfParseFn }).default;

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function gatewayHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk || !ck) {
    throw new Error("Google Drive is not connected. Link the Google Drive connector in Project Settings.");
  }
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

async function driveList(folderId: string): Promise<Array<{ id: string; name: string; modifiedTime?: string }>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=modifiedTime desc`, {
    headers: gatewayHeaders(),
  });
  if (!r.ok) throw new Error(`Drive list failed (${r.status}): ${await r.text()}`);
  const json = (await r.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
  return json.files ?? [];
}

async function driveDownload(fileId: string): Promise<ArrayBuffer> {
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, { headers: gatewayHeaders() });
  if (!r.ok) throw new Error(`Drive download ${fileId} failed (${r.status})`);
  return await r.arrayBuffer();
}

async function loadReportsFolderId(supabase: import("@supabase/supabase-js").SupabaseClient): Promise<string> {
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

export function parseReportText(text: string): Omit<ParsedReport, "file_id" | "file_name" | "raw_text"> {
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
  return {
    sample_id_in_report: sampleIdMatch ? sampleIdMatch[1].trim() : null,
    analysis_date: analysisDateMatch ? analysisDateMatch[1].trim() : null,
    total_peptide_contents_mg: totalMatch ? Number(totalMatch[1]) : null,
    compounds,
  };
}

export const parseReportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().min(1), file_name: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const bytes = await driveDownload(data.file_id);
    const { text } = await pdfParse(Buffer.from(bytes));
    const parsed = parseReportText(text);
    // Normalize the report's "Analysis date:" text into a real timestamp
    // so it can be saved verbatim — the raw extracted string is usually
    // Postgres-parseable already (e.g. "2026-08-03 21:35:13-07:00") but
    // isn't strictly ISO 8601, so round-trip it through Date first.
    const analysisDate = (() => {
      if (!parsed.analysis_date) return null;
      const d = new Date(parsed.analysis_date);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })();
    return { file_id: data.file_id, file_name: data.file_name, raw_text: text, ...parsed, analysis_date: analysisDate };
  });

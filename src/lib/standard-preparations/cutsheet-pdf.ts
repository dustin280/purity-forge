/**
 * Client-side PDF generator for a Standard Set "cut sheet" -- the combined
 * label + recipe + record document confirmed as the target end-state for
 * Sample/Standard Prep on 2026-08-23 (see memory: purity-forge-sample-prep-
 * target-design). One page: vial labels sized to the real label sheet grid
 * (Template R001/LS-0100F, 8 cols, 1in x 0.5in cells) with a cut line, then
 * the recipe and the reasoning behind the chosen range below, mirroring
 * generateCoaPdf's letterhead/table/signature-block conventions (coa-pdf.ts)
 * so it looks like the rest of this app's professional documents.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

const LABEL_COLS = 8;
const CELL_W = 1; // inches, matches the physical label sheet
const CELL_H = 0.5;
const MARGIN_LR = 0.25;
const MARGIN_TOP = 0.5;

export interface CutSheetComponent {
  abbrev: string; // short label-line abbreviation, e.g. "CJC", "TB", "BP", "K"
  concMgPerMl: number | null;
  stockUl: number | null;
}

export interface CutSheetLevel {
  label: string; // "L1"
  components: CutSheetComponent[];
  diluentUl: number | null;
  expectedNote?: string | null; // "CJC 87 · Ipa 379"
}

export interface StandardSetCutSheetInput {
  standardName: string;
  logNumber: string;
  synId?: string | null;
  preparedAt: string;
  analystName: string;
  diluentName: string;
  batchVolumeMl: number;
  levels: CutSheetLevel[];
  rangeReasoning: string;
  reviewerName?: string | null;
  approvedAt?: string | null;
}

function labelCellText(level: CutSheetLevel): string {
  const compLines = level.components.map(c => `${c.abbrev}.${c.concMgPerMl ?? "?"}`).join(" ");
  return `${level.label} ${compLines} <D>`;
}

export function generateStandardSetCutSheetPdf(data: StandardSetCutSheetInput): jsPDF {
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const W = doc.internal.pageSize.getWidth();

  // ---- Label row(s): real label-sheet grid, up to 8 per row ----
  const rows = Math.ceil(data.levels.length / LABEL_COLS) || 1;
  doc.setFont("helvetica", "bold");
  for (let i = 0; i < data.levels.length; i++) {
    const row = Math.floor(i / LABEL_COLS);
    const col = i % LABEL_COLS;
    const x = MARGIN_LR + col * CELL_W;
    const y = MARGIN_TOP + row * CELL_H;
    doc.setDrawColor(184, 190, 196);
    doc.rect(x, y, CELL_W, CELL_H);
    doc.setFontSize(6.5);
    const text = labelCellText(data.levels[i]);
    const lines = doc.splitTextToSize(text, CELL_W - 0.1);
    doc.text(lines, x + CELL_W / 2, y + CELL_H / 2 - (lines.length - 1) * 0.035, { align: "center" });
  }
  // Blank remaining cells in the last row so the grid reads as real label stock
  const usedInLastRow = data.levels.length % LABEL_COLS || LABEL_COLS;
  if (data.levels.length < rows * LABEL_COLS) {
    for (let col = usedInLastRow; col < LABEL_COLS; col++) {
      const x = MARGIN_LR + col * CELL_W;
      const y = MARGIN_TOP + (rows - 1) * CELL_H;
      doc.setDrawColor(210, 213, 217);
      doc.rect(x, y, CELL_W, CELL_H);
    }
  }

  let y = MARGIN_TOP + rows * CELL_H + 0.1;
  doc.setDrawColor(140);
  doc.line(MARGIN_LR, y, W - MARGIN_LR, y);
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.setFont("helvetica", "italic");
  doc.text("cut along this line — labels above, prep record below", W / 2, y + 0.12, { align: "center" });
  y += 0.3;

  // ---- Letterhead ----
  doc.setFillColor(255, 255, 255);
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", MARGIN_LR, y, 1.4, 0.42);
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Standard Preparation Record", W - MARGIN_LR, y + 0.24, { align: "right" });
  y += 0.5;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.01);
  doc.line(MARGIN_LR, y, W - MARGIN_LR, y);
  y += 0.22;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(data.standardName, MARGIN_LR, y);
  y += 0.2;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  const idLine = [data.synId, data.logNumber].filter(Boolean).join(" · ");
  doc.text(idLine, MARGIN_LR, y);
  y += 0.22;

  // ---- Info block ----
  doc.setFontSize(8.5);
  const info: [string, string][] = [
    ["Analyst", data.analystName],
    ["Prepared", new Date(data.preparedAt).toLocaleString()],
    ["Diluent", data.diluentName],
    ["Batch volume", `${data.batchVolumeMl} mL`],
  ];
  info.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 41, 55);
    doc.text(k + ":", MARGIN_LR, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, MARGIN_LR + 1.1, y);
    y += 0.16;
  });
  y += 0.08;

  // ---- Recipe table ----
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 83, 45);
  doc.text("RECIPE", MARGIN_LR, y);
  y += 0.08;

  const compoundNames = Array.from(new Set(data.levels.flatMap(l => l.components.map(c => c.abbrev))));
  const head = ["Level", ...compoundNames.map(n => `${n} mg/mL`), ...compoundNames.map(n => `${n} µL`), "Diluent µL", "Expected"];
  const body = data.levels.map(l => {
    const byAbbrev = new Map(l.components.map(c => [c.abbrev, c] as const));
    return [
      l.label,
      ...compoundNames.map(n => byAbbrev.get(n)?.concMgPerMl?.toString() ?? "—"),
      ...compoundNames.map(n => byAbbrev.get(n)?.stockUl?.toString() ?? "—"),
      l.diluentUl?.toString() ?? "—",
      l.expectedNote ?? "",
    ];
  });
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: { fontSize: 7.5, font: "helvetica", cellPadding: 0.04 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 6.8 },
    margin: { left: MARGIN_LR, right: MARGIN_LR },
  });

  const afterTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y = afterTableY + 0.2;

  // ---- Reasoning ----
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 83, 45);
  doc.text("WHY THIS RANGE", MARGIN_LR, y);
  y += 0.16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  const wrapped = doc.splitTextToSize(data.rangeReasoning, W - MARGIN_LR * 2);
  doc.text(wrapped, MARGIN_LR, y);
  y += wrapped.length * 0.12 + 0.15;

  // ---- Signatures ----
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 1.3) { doc.addPage(); y = MARGIN_TOP; }
  const colW = (W - MARGIN_LR * 2 - 0.3) / 2;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 41, 55);
  doc.text("PREPARED BY", MARGIN_LR, y);
  doc.text("REVIEWED BY", MARGIN_LR + colW + 0.3, y);
  y += 0.35;
  doc.setDrawColor(150);
  doc.line(MARGIN_LR, y, MARGIN_LR + colW, y);
  doc.line(MARGIN_LR + colW + 0.3, y, MARGIN_LR + colW * 2 + 0.3, y);
  y += 0.14;
  doc.setFont("helvetica", "normal");
  doc.text(data.analystName || "—", MARGIN_LR, y);
  doc.text(data.reviewerName || "—", MARGIN_LR + colW + 0.3, y);
  y += 0.14;
  doc.setTextColor(120);
  doc.setFontSize(7);
  doc.text(`Date: ${new Date(data.preparedAt).toLocaleDateString()}`, MARGIN_LR, y);
  doc.text(`Date: ${data.approvedAt ? new Date(data.approvedAt).toLocaleDateString() : "—"}`, MARGIN_LR + colW + 0.3, y);

  // ---- Footer ----
  doc.setFontSize(6.5);
  doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()} • Synthesyx • ${data.logNumber}`, MARGIN_LR, pageH - 0.25);
  doc.text("Template R001/LS-0100F, 8×20, 1in×0.5in cells", W - MARGIN_LR, pageH - 0.25, { align: "right" });

  return doc;
}

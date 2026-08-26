/**
 * Bench Reference cut sheet PDF -- the sample-prep sibling of
 * standard-preparations/cutsheet-pdf.ts, same label-grid + recipe +
 * signatures shape (see memory purity-forge-sample-prep-target-design),
 * adapted for a dilution plan rather than a standard set. One page per
 * sample: vial labels for each dilution step sized to the real label sheet
 * grid (Template R001/LS-0100F, 8 cols, 1in x 0.5in cells), a cut line,
 * then the recipe steps and final concentration/DF below.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";
import type { CutSheetSample } from "./bench-reference.functions";

const LABEL_COLS = 8;
const CELL_W = 1;
const CELL_H = 0.5;
const MARGIN_LR = 0.25;
const MARGIN_TOP = 0.5;

export interface BenchReferenceCutSheetInput {
  samples: CutSheetSample[];
  analystName: string;
  preparedAt: string;
  labelsPerStep: number;
}

function fmtConc(n: number): string {
  return `${n.toPrecision(3)} mg/mL`;
}

// jsPDF's built-in fonts (Helvetica etc.) only cover WinAnsi/CP1252 --
// prep-engine.ts's instruction strings use "→" (U+2192), which isn't in
// that set and renders as mojibake in a real PDF viewer (confirmed
// 2026-08-26 reading a generated cut sheet's raw bytes directly; browsers
// hide this by silently font-substituting, so it wasn't caught by
// screenshotting the in-app preview iframe earlier). Substitute at the
// PDF boundary only -- the web UI keeps the real arrow.
function pdfSafe(s: string): string {
  return s.replace(/→/g, "->");
}

export function generateBenchReferenceCutSheetPdf(data: BenchReferenceCutSheetInput): jsPDF {
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const copies = Math.max(1, data.labelsPerStep);

  data.samples.forEach((sample, sampleIdx) => {
    if (sampleIdx > 0) doc.addPage();

    // ---- Label row(s): one label per step, `copies` times each ----
    const displayName = sample.resolvedCompound ?? sample.compound ?? sample.batchId;
    const labels = sample.steps.flatMap(s =>
      Array.from({ length: copies }, () => (s.label || `${sample.batchId} ${displayName}`)),
    );
    const rows = Math.ceil(labels.length / LABEL_COLS) || 1;
    doc.setFont("helvetica", "bold");
    labels.forEach((text, i) => {
      const row = Math.floor(i / LABEL_COLS);
      const col = i % LABEL_COLS;
      const x = MARGIN_LR + col * CELL_W;
      const y = MARGIN_TOP + row * CELL_H;
      doc.setDrawColor(184, 190, 196);
      doc.rect(x, y, CELL_W, CELL_H);
      doc.setFontSize(6.5);
      const lines = doc.splitTextToSize(`${sample.batchId}\n${text}`, CELL_W - 0.1);
      doc.text(lines, x + CELL_W / 2, y + CELL_H / 2 - (lines.length - 1) * 0.035, { align: "center" });
    });
    const usedInLastRow = labels.length % LABEL_COLS || LABEL_COLS;
    if (labels.length < rows * LABEL_COLS) {
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
    doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", MARGIN_LR, y, 1.4, 0.42);
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Sample Preparation Record", W - MARGIN_LR, y + 0.24, { align: "right" });
    y += 0.5;
    doc.setDrawColor(31, 41, 55);
    doc.setLineWidth(0.01);
    doc.line(MARGIN_LR, y, W - MARGIN_LR, y);
    y += 0.22;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${sample.batchId} — ${displayName}`, MARGIN_LR, y);
    y += 0.2;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(sample.prepNumber, MARGIN_LR, y);
    y += 0.22;

    // ---- Info block ----
    doc.setFontSize(8.5);
    const info: [string, string][] = [
      ["Analyst", data.analystName],
      ["Prepared", new Date(data.preparedAt).toLocaleString()],
      ["Final DF", sample.totalDilutionFactor != null ? `${sample.totalDilutionFactor.toPrecision(3)}×` : "—"],
    ];
    if (!sample.isBlend) {
      info.push([
        "Target",
        sample.targetConcentrationMgPerMl != null
          ? `${fmtConc(sample.targetConcentrationMgPerMl)}${sample.calibrationLevel != null ? ` (Level ${sample.calibrationLevel})` : ""}`
          : "—",
      ]);
    }
    info.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(31, 41, 55);
      doc.text(k + ":", MARGIN_LR, y);
      doc.setFont("helvetica", "normal");
      doc.text(v, MARGIN_LR + 1.1, y);
      y += 0.16;
    });
    y += 0.08;

    // ---- Blend component table ----
    if (sample.isBlend && sample.components.length) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 83, 45);
      doc.text("COMPONENTS", MARGIN_LR, y);
      y += 0.08;
      autoTable(doc, {
        startY: y,
        head: [["Component", "Target", "Resulting", "In range"]],
        body: sample.components.map(c => [
          c.name, fmtConc(c.targetConcMgPerMl), fmtConc(c.resultingConcMgPerMl),
          c.withinRange === false ? "OUTSIDE RANGE" : "yes",
        ]),
        styles: { fontSize: 7.5, font: "helvetica", cellPadding: 0.04 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 6.8 },
        bodyStyles: { textColor: 40 },
        didParseCell: (hook) => {
          if (hook.section === "body" && hook.column.index === 3 && hook.cell.raw === "OUTSIDE RANGE") {
            hook.cell.styles.textColor = [185, 28, 28];
            hook.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: MARGIN_LR, right: MARGIN_LR },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 0.15;
    }

    // ---- Steps table ----
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 83, 45);
    doc.text("PROCEDURE", MARGIN_LR, y);
    y += 0.08;
    autoTable(doc, {
      startY: y,
      head: [["#", "Instruction"]],
      body: sample.steps.map(s => [String(s.ordinal), pdfSafe(s.instruction)]),
      styles: { fontSize: 7.5, font: "helvetica", cellPadding: 0.05 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 6.8 },
      columnStyles: { 0: { cellWidth: 0.3 } },
      margin: { left: MARGIN_LR, right: MARGIN_LR },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 0.15;

    if (sample.warnings.length) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(185, 28, 28);
      const wrapped = doc.splitTextToSize(`Warnings: ${sample.warnings.join(" — ")}`, W - MARGIN_LR * 2);
      doc.text(wrapped, MARGIN_LR, y);
      y += wrapped.length * 0.12 + 0.1;
    }

    // ---- Signatures ----
    if (y > pageH - 1.1) { doc.addPage(); y = MARGIN_TOP; }
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
    doc.setTextColor(0);
    doc.text(data.analystName || "—", MARGIN_LR, y);
    y += 0.14;
    doc.setTextColor(120);
    doc.setFontSize(7);
    doc.text(`Date: ${new Date(data.preparedAt).toLocaleDateString()}`, MARGIN_LR, y);

    // ---- Footer ----
    doc.setFontSize(6.5);
    doc.setTextColor(150);
    doc.text(`Generated ${new Date().toLocaleString()} • Synthesyx • ${sample.prepNumber}`, MARGIN_LR, pageH - 0.25);
    doc.text("Template R001/LS-0100F, 8×20, 1in×0.5in cells", W - MARGIN_LR, pageH - 0.25, { align: "right" });
  });

  return doc;
}

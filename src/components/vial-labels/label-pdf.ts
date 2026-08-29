/**
 * Renders label sheets to a PDF at exact inch coordinates.
 *
 * Browser printing of the HTML sheet is accurate on desktop but not on
 * phones: mobile Chrome/Safari ignore `@page { margin: 0 }`, add their own
 * page margins and header/footer, then scale the 8.5in sheet to fit what's
 * left -- which is why labels came out shifted and clipped at the top. A PDF
 * carries its own page geometry, so the phone's print path has nothing left
 * to reinterpret and the sheet lands identically on every device.
 *
 * Geometry mirrors label-sheet.tsx exactly (template R001 / LS-0100F):
 * 8 x 20 cells of 1in x 0.5in, 0.5in top margin, 0.25in side margins.
 */
import { jsPDF } from "jspdf";
import { COLS, ROWS } from "./label-sheet";

const PAGE_W = 8.5;
const PAGE_H = 11;
const CELL_W = 1;
const CELL_H = 0.5;
const MARGIN_LEFT = 0.25;
const MARGIN_TOP = 0.5;
/** Keeps text off the die-cut edge, matching the HTML cell's 1px/2px padding. */
const PAD_X = 0.03;

export type LabelPdfOptions = {
  fontSizePt: number;
  bold: boolean;
  wrap: boolean;
  hAlign: "left" | "center" | "right";
  vAlign: "top" | "middle" | "bottom";
  showFooter: boolean;
  footerText?: string;
};

export function buildLabelPdf(sheets: string[][], opts: LabelPdfOptions): jsPDF {
  const doc = new jsPDF({ unit: "in", format: [PAGE_W, PAGE_H], orientation: "portrait" });
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.fontSizePt);
  doc.setTextColor(0, 0, 0);

  // jsPDF measures in the doc's unit (inches); line height follows the point
  // size, so convert once rather than guessing a ratio.
  const lineH = (opts.fontSizePt * 1.05) / 72;

  sheets.forEach((cells, sheetIdx) => {
    if (sheetIdx > 0) doc.addPage([PAGE_W, PAGE_H], "portrait");

    cells.forEach((text, cellIdx) => {
      if (!text) return;
      const col = cellIdx % COLS;
      const row = Math.floor(cellIdx / COLS);
      if (row >= ROWS) return;

      const cellX = MARGIN_LEFT + col * CELL_W;
      const cellY = MARGIN_TOP + row * CELL_H;
      const usableW = CELL_W - PAD_X * 2;

      const lines: string[] = opts.wrap
        ? (doc.splitTextToSize(text, usableW) as string[]).slice(0, 4)
        : [text];

      const blockH = lines.length * lineH;
      let baselineY: number;
      if (opts.vAlign === "top") baselineY = cellY + PAD_X + lineH;
      else if (opts.vAlign === "bottom") baselineY = cellY + CELL_H - PAD_X - blockH + lineH;
      else baselineY = cellY + (CELL_H - blockH) / 2 + lineH * 0.82;

      const textX =
        opts.hAlign === "left" ? cellX + PAD_X
        : opts.hAlign === "right" ? cellX + CELL_W - PAD_X
        : cellX + CELL_W / 2;

      lines.forEach((line, i) => {
        doc.text(line, textX, baselineY + i * lineH, { align: opts.hAlign, baseline: "alphabetic" });
      });
    });

    if (opts.showFooter && opts.footerText) {
      doc.setFontSize(9);
      doc.text(opts.footerText, PAGE_W / 2, PAGE_H - 0.15, { align: "center" });
      doc.setFontSize(opts.fontSizePt);
    }
  });

  return doc;
}

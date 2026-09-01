/**
 * Standalone label sheet for Standard Prep Freelance -- vial labels only,
 * no recipe or signature block. Deliberately separate from
 * cutsheet-pdf.ts's generateStandardSetCutSheetPdf: that document's label
 * grid uses its own convention (level + abbrev.conc, no standard name),
 * tied to the controlled record it's printed above. This one exists so the
 * label text can match the run list's Sample Name exactly -- the vial and
 * the sequence row have to read the same or a technician can't match one
 * back to the other -- without generating (or re-generating) a full
 * record every time you just need to reprint labels.
 */
import jsPDF from "jspdf";
import { wrapPdf } from "@/lib/pdf-text";
import { freelanceSampleName, type FreelanceNamingLevel } from "./freeform-sample-name";

const LABEL_COLS = 8;
const CELL_W = 1; // inches -- matches the real label sheet (Template R001/LS-0100F)
const CELL_H = 0.5;
const MARGIN_LR = 0.25;
const MARGIN_TOP = 0.5;

/**
 * Border weight, set explicitly before the first cell. jsPDF carries
 * whatever line width was last set into a fresh document/page -- this
 * PDF has nothing before it to inherit from, but leaving it implicit is
 * exactly what produced a fifth-of-an-inch border (and a clipped top edge)
 * on the sample cut sheet earlier this session. Stated outright here so
 * this generator can't repeat that.
 */
const LABEL_BORDER_IN = 0.008;

export function generateFreelanceLabelSheetPdf(standardName: string, levels: FreelanceNamingLevel[]): jsPDF {
  const doc = wrapPdf(new jsPDF({ unit: "in", format: "letter", compress: true }));
  doc.setFont("helvetica", "bold");
  doc.setLineWidth(LABEL_BORDER_IN);
  levels.forEach((level, i) => {
    const row = Math.floor(i / LABEL_COLS);
    const col = i % LABEL_COLS;
    const x = MARGIN_LR + col * CELL_W;
    const y = MARGIN_TOP + row * CELL_H;
    doc.setDrawColor(150, 157, 165);
    doc.rect(x, y, CELL_W, CELL_H);
    doc.setFontSize(6.5);
    const text = freelanceSampleName(standardName, level);
    const lines = doc.splitTextToSize(text, CELL_W - 0.1);
    doc.text(lines, x + CELL_W / 2, y + CELL_H / 2 - (lines.length - 1) * 0.035, { align: "center" });
  });
  return doc;
}

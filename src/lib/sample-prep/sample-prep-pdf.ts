/**
 * Controlled sample-preparation document. Renders server-side (called from
 * the Accept flow, not a browser download button) since the bytes get
 * uploaded to Drive rather than saved locally — pattern-matched to
 * src/lib/coc-blank-pdf.ts for the letterhead/stamp/section styling and to
 * src/lib/standard-preparation-pdf.ts for the simple line-based content
 * flow and the "render captured signer as text" convention.
 */
import jsPDF from "jspdf";
import { wrapPdf } from "@/lib/pdf-text";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export interface SamplePrepPdfStep {
  ordinal: number;
  instruction: string;
  vesselName: string | null;
  equipmentLabel: string | null;
}

export interface SamplePrepPdfInput {
  prepNumber: string;
  batchId: string | null;
  compound: string | null;
  analyteName: string;
  methodName: string;
  methodVersion: string;
  asReceivedSummary: string;
  targetConcentrationDisplay: string;
  calibrationLevel: number | null;
  steps: SamplePrepPdfStep[];
  warnings: string[];
  preparedByName: string;
  preparedAt: string;
}

export function buildSamplePrepPdf(input: SamplePrepPdfInput): jsPDF {
  const doc = wrapPdf(new jsPDF({ unit: "pt", format: "letter", compress: true }));
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  };

  // --- Letterhead ---
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, y - 6, 120, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(31, 41, 55);
  doc.text("Sample Preparation Record", pageW - margin, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Controlled Document", pageW - margin, y + 24, { align: "right" });
  y += 36;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // Prep number stamp
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("PREP NUMBER", margin + 8, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text(input.prepNumber, margin + 8, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin - 8, y + 16, { align: "right" });
  y += 34;

  const field = (label: string, value: string) => {
    ensureRoom(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(20);
    const wrapped = doc.splitTextToSize(value || "—", pageW - margin * 2 - 130);
    doc.text(wrapped, margin + 130, y);
    y += Math.max(14, wrapped.length * 11);
  };

  field("Sample", input.batchId ?? "—");
  field("Compound / Analyte", `${input.compound ?? "—"} (${input.analyteName})`);
  field("Method", `${input.methodName} — rev. ${input.methodVersion}`);
  field("As received", input.asReceivedSummary);
  field("Target", `${input.targetConcentrationDisplay}${input.calibrationLevel != null ? ` (Level ${input.calibrationLevel})` : ""}`);
  y += 6;

  // --- Steps ---
  ensureRoom(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Preparation Steps", margin, y);
  y += 4;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  input.steps.forEach((s) => {
    ensureRoom(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(31, 41, 55);
    doc.text(`${s.ordinal}.`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    const wrapped = doc.splitTextToSize(s.instruction, pageW - margin * 2 - 20);
    doc.text(wrapped, margin + 20, y);
    y += wrapped.length * 12 + 2;
    const meta = [s.vesselName && `Vessel: ${s.vesselName}`, s.equipmentLabel && `Equipment: ${s.equipmentLabel}`].filter(Boolean).join("  ·  ");
    if (meta) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(meta, margin + 20, y);
      y += 12;
    }
    y += 6;
  });

  if (input.warnings.length) {
    y += 4;
    ensureRoom(20 + input.warnings.length * 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(180, 100, 20);
    doc.text("Warnings", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 80, 20);
    input.warnings.forEach((w) => {
      const wrapped = doc.splitTextToSize(`• ${w}`, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 11;
    });
  }

  // --- Acceptance ---
  y += 10;
  ensureRoom(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Acceptance", margin, y);
  y += 4;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30);
  doc.text(`Accepted by: ${input.preparedByName} on ${new Date(input.preparedAt).toLocaleString()}`, margin, y);
  y += 16;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("This plan reflects the calculated preparation at the time of acceptance. Bench execution values, if they differ, are recorded separately in the Sample Prep record.", margin, y, { maxWidth: pageW - margin * 2 });

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(`Prep ${input.prepNumber}`, margin, pageH - 20);
  doc.text("Page 1", pageW - margin, pageH - 20, { align: "right" });

  return doc;
}

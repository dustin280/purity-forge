/**
 * Blank / printable Chain of Custody form. Renders a paper form matching the
 * intake process (client info + line items grid + custody transfer signatures
 * + pricing block) with the branded letterhead and a pre-issued Lab Sample ID
 * stamped in the top-right corner.
 */
import { jsPDF } from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";
import type { CocFieldLite } from "@/lib/coc-pdf";

export function buildBlankCocPdf(sampleId: string, fields: CocFieldLite[]): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // --- Letterhead ---
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, y - 6, 120, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(31, 41, 55);
  doc.text("Sample Receipt", pageW - margin, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Chain of Custody", pageW - margin, y + 24, { align: "right" });
  y += 36;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // Lab Sample ID stamp
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 24, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("LAB SAMPLE ID", margin + 8, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text(sampleId, margin + 8, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`Issued: ${new Date().toLocaleString()}`, pageW - margin - 8, y + 16, { align: "right" });
  y += 32;

  // --- Client / receipt fields (2-column form) ---
  doc.setTextColor(0);
  const colW = (pageW - margin * 2 - 12) / 2;
  const rowH = 30;
  const skipFields = new Set(["sample_id", "requested_tests"]);
  const printable = fields.filter(f => !skipFields.has(f.field_key));
  let colIdx = 0;
  let rowY = y;
  for (const f of printable) {
    if (rowY + rowH > pageH - 260) break; // leave room for line items + custody
    const x = margin + (colIdx === 0 ? 0 : colW + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(f.label.toUpperCase(), x, rowY + 8);
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.line(x, rowY + 22, x + colW, rowY + 22);
    colIdx = 1 - colIdx;
    if (colIdx === 0) rowY += rowH;
  }
  if (colIdx === 1) rowY += rowH;
  y = rowY + 8;

  // --- Samples / line items grid ---
  if (y + 130 > pageH - margin) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Samples", margin, y);
  y += 4;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  const cols: Array<{ label: string; w: number }> = [
    { label: "#", w: 20 },
    { label: "Compound", w: 110 },
    { label: "Lot / Batch", w: 75 },
    { label: "Catalog #", w: 65 },
    { label: "Container / Conc.", w: 90 },
    { label: "Qty / Vials", w: 60 },
    { label: "Temp °C / Storage", w: 75 },
    { label: "Requested Tests", w: 0 },
  ];
  const totalFixed = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = pageW - margin * 2 - totalFixed;

  // Header row
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(60);
  let cx = margin;
  for (const c of cols) {
    doc.text(c.label, cx + 4, y + 10);
    cx += c.w;
  }
  y += 16;

  // Empty rows
  const rowsN = 8;
  const lineRowH = 22;
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  for (let i = 0; i < rowsN; i++) {
    doc.rect(margin, y, pageW - margin * 2, lineRowH);
    // vertical dividers
    cx = margin;
    for (let k = 0; k < cols.length - 1; k++) {
      cx += cols[k].w;
      doc.line(cx, y, cx, y + lineRowH);
    }
    // row number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(String(i + 1), margin + 6, y + 14);
    y += lineRowH;
  }
  y += 10;

  // --- Pricing block ---
  if (y + 90 > pageH - margin) { doc.addPage(); y = margin; }
  const priceX = pageW - margin - 220;
  const priceW = 220;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("Pricing", priceX, y + 10);
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.5);
  doc.line(priceX, y + 12, priceX + priceW, y + 12);
  const priceRows = ["Analysis", "Rush / Priority", "Additional Tests", "Subtotal", "Total"];
  let py = y + 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  for (const label of priceRows) {
    const isTotal = label === "Total" || label === "Subtotal";
    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.text(label, priceX, py);
    doc.setDrawColor(200);
    doc.line(priceX + 90, py + 2, priceX + priceW, py + 2);
    py += 16;
  }

  // Notes column on the left of pricing
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text("Notes", margin, y + 10);
  doc.line(margin, y + 12, priceX - 12, y + 12);
  doc.setDrawColor(220);
  for (let i = 0; i < 4; i++) {
    const ly = y + 26 + i * 14;
    doc.line(margin, ly, priceX - 12, ly);
  }
  y = Math.max(py, y + 26 + 4 * 14) + 12;

  // --- Custody transfer / signatures ---
  if (y + 100 > pageH - margin) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Chain of Custody Transfers", margin, y);
  y += 4;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  const sigCols: Array<{ label: string; w: number }> = [
    { label: "Role", w: 90 },
    { label: "Printed Name", w: 140 },
    { label: "Signature", w: 150 },
    { label: "Date / Time", w: 0 },
  ];
  const sigFixed = sigCols.reduce((s, c) => s + c.w, 0);
  sigCols[sigCols.length - 1].w = pageW - margin * 2 - sigFixed;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(60);
  cx = margin;
  for (const c of sigCols) {
    doc.text(c.label, cx + 4, y + 10);
    cx += c.w;
  }
  y += 16;

  const roles = ["Relinquished by (Client)", "Received by (Lab)", "Verified by"];
  const sigRowH = 28;
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  for (const role of roles) {
    doc.rect(margin, y, pageW - margin * 2, sigRowH);
    cx = margin;
    for (let k = 0; k < sigCols.length - 1; k++) {
      cx += sigCols[k].w;
      doc.line(cx, y, cx, y + sigRowH);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30);
    doc.text(role, margin + 6, y + 17);
    y += sigRowH;
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `Lab Sample ID: ${sampleId} — retain a copy with the shipment.`,
    margin, pageH - 20,
  );
  doc.text(
    `Page 1`,
    pageW - margin, pageH - 20,
    { align: "right" },
  );

  return doc;
}
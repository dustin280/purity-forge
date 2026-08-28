/**
 * Chain of Custody for an OUTBOUND shipment to a subcontract lab -- a
 * different document from coc-pdf.ts/coc-blank-pdf.ts, which both cover
 * inbound intake at Synthesyx. This is for samples already physically
 * on-site (received from a client/broker) that Synthesyx is forwarding to
 * a third-party lab for a test it doesn't run in-house (heavy metals is
 * always outsourced -- see FLAG_TEST_DEFAULTS in test-provisioning.ts).
 * Line items carry a client-provided lot number as the reference ID since
 * no internal SYX ID may exist yet at the point of shipment.
 */
import { jsPDF } from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export type OutboundCocLineItem = {
  client: string;
  clientLot: string;
  compound: string;
};

export function buildOutboundCocPdf(
  receivingLab: string,
  requestedTests: string,
  items: OutboundCocLineItem[],
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // --- Letterhead ---
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, y - 6, 120, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(31, 41, 55);
  doc.text("Outbound Chain of Custody", pageW - margin, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Subcontract Laboratory Shipment", pageW - margin, y + 24, { align: "right" });
  y += 36;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // --- Pending-ID notice ---
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.6);
  doc.rect(margin, y, pageW - margin * 2, 20, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(146, 64, 14);
  doc.text(
    "No internal Sample ID assigned yet — reference by Client Lot # until intake is completed.",
    margin + 8, y + 13,
  );
  y += 32;

  // --- Transfer block ---
  const colW = (pageW - margin * 2 - 20) / 2;
  const transferY = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text("SHIPPING FROM", margin, y);
  doc.text("SHIPPING TO", margin + colW + 20, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text("Synthesyx Laboratories", margin, y);
  doc.text(receivingLab, margin + colW + 20, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text("Las Vegas, Nevada", margin, y);
  doc.text(`Requested tests: ${requestedTests}`, margin + colW + 20, y);
  y = Math.max(y, transferY + 26) + 10;
  doc.setDrawColor(200);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Date shipped: ${new Date().toLocaleDateString()}`, margin, y);
  y += 20;

  // --- Line items ---
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
    { label: "#", w: 24 },
    { label: "Client", w: 130 },
    { label: "Client Lot #", w: 150 },
    { label: "Compound", w: 0 },
  ];
  const totalFixed = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = pageW - margin * 2 - totalFixed;

  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  let cx = margin;
  for (const c of cols) {
    doc.text(c.label, cx + 6, y + 12);
    cx += c.w;
  }
  y += 18;

  const rowH = 26;
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  items.forEach((item, i) => {
    doc.rect(margin, y, pageW - margin * 2, rowH);
    cx = margin;
    for (let k = 0; k < cols.length - 1; k++) {
      cx += cols[k].w;
      doc.line(cx, y, cx, y + rowH);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30);
    const rowVals = [String(i + 1), item.client, item.clientLot, item.compound];
    let tx = margin;
    rowVals.forEach((v, ci) => {
      const w = cols[ci].w;
      const lines = doc.splitTextToSize(v, w - 10);
      doc.text(lines, tx + 6, y + 12);
      tx += w;
    });
    y += rowH;
  });
  y += 20;

  // --- Custody transfer signatures ---
  if (y + 130 > pageH - margin) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text("Chain of Custody Transfer", margin, y);
  y += 4;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  const sigCols: Array<{ label: string; w: number }> = [
    { label: "Role", w: 130 },
    { label: "Printed Name", w: 150 },
    { label: "Signature", w: 150 },
    { label: "Date / Time", w: 0 },
  ];
  const sigFixed = sigCols.reduce((s, c) => s + c.w, 0);
  sigCols[sigCols.length - 1].w = pageW - margin * 2 - sigFixed;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageW - margin * 2, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  cx = margin;
  for (const c of sigCols) {
    doc.text(c.label, cx + 6, y + 12);
    cx += c.w;
  }
  y += 18;

  const roles = [`Relinquished by (Synthesyx)`, `Received by (${receivingLab})`];
  const sigRowH = 32;
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
    doc.text(role, margin + 6, y + 19);
    y += sigRowH;
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString()} • Synthesyx • ${items.length} sample${items.length === 1 ? "" : "s"} to ${receivingLab}`,
    margin, pageH - 20,
  );

  return doc;
}

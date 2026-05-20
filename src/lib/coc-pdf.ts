import { jsPDF } from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export type CocFieldLite = { field_key: string; label: string };
export type CocLineItem = {
  compound?: string; lot?: string; catalog?: string; manufacturer?: string;
  quantity?: string; quantity_unit?: string;
  container_size?: string; concentration?: string;
  vial_count?: number; temperature_c?: string | number;
  storage?: string; requested_tests?: string[];
  client_received_date?: string; manufacture_date?: string;
  physical_description?: string;
};
export type CocRecordLite = {
  id: string;
  sample_id: string;
  data: Record<string, unknown>;
  created_at: string;
  line_items?: CocLineItem[];
};

export function buildCocPdf(record: CocRecordLite, fields: CocFieldLite[]): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  // Branded letterhead
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, y - 6, 120, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text("Chain of Custody", pageW - margin, y + 14, { align: "right" });
  y += 36;
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setTextColor(0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Sample ID: ${record.sample_id}`, margin, y);
  doc.text(
    `Created: ${new Date(record.created_at).toLocaleString()}`,
    pageW - margin,
    y,
    { align: "right" }
  );
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setTextColor(0);

  const labelW = 200;
  const valueX = margin + labelW + 8;
  const valueW = pageW - margin - valueX;

  for (const f of fields) {
    const raw = record.data?.[f.field_key];
    let value: string;
    if (raw == null || raw === "") value = "—";
    else if (Array.isArray(raw)) value = raw.join(", ");
    else value = String(raw);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const labelLines = doc.splitTextToSize(f.label, labelW);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const valueLines = doc.splitTextToSize(value, valueW);

    const rowH = Math.max(labelLines.length * 11, valueLines.length * 12) + 8;
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(labelLines, margin, y + 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(valueLines, valueX, y + 10);

    y += rowH;
    doc.setDrawColor(235);
    doc.line(margin, y - 2, pageW - margin, y - 2);
  }

  // === Samples / Compounds & Lots section ===
  const items = Array.isArray(record.line_items) ? record.line_items : [];
  if (items.length > 0) {
    if (y + 40 > pageH - margin) { doc.addPage(); y = margin; }
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);
    doc.text(`Samples (${items.length})`, margin, y);
    y += 6;
    doc.setDrawColor(31, 41, 55);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 12;
    doc.setTextColor(0);

    items.forEach((li, idx) => {
      const seqLabel = `Sample ${String(idx + 1).padStart(2, "0")}`;
      const headerText = `${seqLabel}${li.compound ? ` — ${li.compound}` : ""}${li.vial_count && li.vial_count > 1 ? `  ×${li.vial_count} vials` : ""}`;

      const pairs: Array<[string, string]> = [
        ["Lot / Batch", li.lot || "—"],
        ["Catalog #", li.catalog || "—"],
        ["Manufacturer", li.manufacturer || "—"],
        ["Manufacture Date", li.manufacture_date || "—"],
        ["Client Received Date", li.client_received_date || "—"],
        ["Container Size", li.container_size || "—"],
        ["Concentration", li.concentration || "—"],
        ["Quantity / vial", li.quantity ? `${li.quantity}${li.quantity_unit ? ` ${li.quantity_unit}` : ""}` : "—"],
        ["Temperature (°C)", li.temperature_c == null || li.temperature_c === "" ? "—" : String(li.temperature_c)],
        ["Storage", li.storage || "—"],
        ["Requested Tests", (li.requested_tests ?? []).join(", ") || "—"],
        ["Physical Description", li.physical_description || "—"],
      ];

      // Estimate height: header + each pair
      const innerLabelW = 150;
      const innerValueX = margin + 12 + innerLabelW + 8;
      const innerValueW = pageW - margin - innerValueX;
      let blockH = 18;
      const wrapped: Array<{ label: string; lines: string[] }> = [];
      for (const [k, v] of pairs) {
        const lines = doc.splitTextToSize(v, innerValueW);
        wrapped.push({ label: k, lines });
        blockH += Math.max(11, lines.length * 11) + 4;
      }
      if (y + blockH > pageH - margin) { doc.addPage(); y = margin; }

      // Block header bar
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, pageW - margin * 2, 16, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(headerText, margin + 6, y + 11);
      y += 18;

      for (const { label, lines } of wrapped) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(90);
        doc.text(label, margin + 12, y + 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(0);
        doc.text(lines, innerValueX, y + 8);
        y += Math.max(11, lines.length * 11) + 4;
      }
      y += 6;
      doc.setDrawColor(225);
      doc.line(margin, y, pageW - margin, y);
      y += 8;
    });
  }

  return doc;
}

export function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "record";
}
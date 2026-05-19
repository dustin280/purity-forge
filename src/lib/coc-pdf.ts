import { jsPDF } from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export type CocFieldLite = { field_key: string; label: string };
export type CocRecordLite = {
  id: string;
  sample_id: string;
  data: Record<string, unknown>;
  created_at: string;
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

  return doc;
}

export function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "record";
}
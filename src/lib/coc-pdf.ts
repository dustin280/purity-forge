/**
 * Client-side PDF generator for Chain-of-Custody (COC) documents. Renders the signed COC form with timestamps, custodian signatures, and configurable field layout.
 */
import { jsPDF } from "jspdf";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

export type CocFieldLite = { field_key: string; label: string };
export type CocLineItemComponentLite = {
  compound_id?: string | null; compound?: string;
  label_content_value?: string; label_content_unit?: string;
};
export type CocLineItem = {
  compound?: string; lot?: string; catalog?: string; manufacturer?: string;
  container_size?: string;
  vial_count?: number;
  requested_tests?: string[];
  client_received_date?: string; manufacture_date?: string;
  physical_description?: string;
  physical_form?: "" | "solid" | "liquid" | "capsule";
  label_content_value?: string; label_content_unit?: string;
  is_multi_component?: boolean;
  components?: CocLineItemComponentLite[];
  bottle_size?: string; liquid_volume_ml?: string; label_content_basis?: "" | "per_ml" | "per_bottle";
  capsule_count?: string;
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
  doc.text("Sample Receipt", pageW - margin, y + 14, { align: "right" });
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

      const labelContent = li.label_content_value
        ? `${li.label_content_value}${li.label_content_unit ? ` ${li.label_content_unit}` : ""}`
        : "—";
      const formPairs: Array<[string, string]> = (() => {
        switch (li.physical_form) {
          case "liquid":
            return [
              ["Bottle Size", li.bottle_size || "—"],
              ["Volume in Bottle", li.liquid_volume_ml ? `${li.liquid_volume_ml} mL` : "—"],
              ["Label Content", li.label_content_basis === "per_bottle" ? `${labelContent} / bottle` : `${labelContent} / mL`],
            ];
          case "capsule":
            return [
              ["Label Content", `${labelContent} / capsule`],
              ["# of Capsules", li.capsule_count || "—"],
            ];
          case "solid":
            return [
              ["Container Size", li.container_size || "—"],
              ["Label Content", labelContent],
            ];
          default:
            return [];
        }
      })();
      const componentsPair: Array<[string, string]> = (li.is_multi_component && li.components?.length)
        ? [["Additional Compounds", li.components.map(c => `${c.compound}${c.label_content_value ? ` (${c.label_content_value}${c.label_content_unit ? ` ${c.label_content_unit}` : ""})` : ""}`).join(", ")]]
        : [];

      const pairs: Array<[string, string]> = [
        ["Physical Form", li.physical_form ? li.physical_form[0].toUpperCase() + li.physical_form.slice(1) : "—"],
        ["Lot / Batch", li.lot || "—"],
        ["Catalog #", li.catalog || "—"],
        ["Manufacturer", li.manufacturer || "—"],
        ["Manufacture Date", li.manufacture_date || "—"],
        ["Client Received Date", li.client_received_date || "—"],
        ...formPairs,
        ...componentsPair,
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
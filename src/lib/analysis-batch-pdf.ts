/**
 * Professional "Record of Analysis" PDF for an analysis batch — mirrors
 * the exact letterhead/table/signature technique used for Certificates of
 * Analysis (see coa-pdf.ts): jsPDF in pt/letter, a logo letterhead band,
 * a real jspdf-autotable sample table, and a two-column signature block.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";

type BatchHeader = {
  batch_number: string;
  test_type: string;
  method: string | null;
  performed_at: string;
  incubation_started_at: string | null;
  status: string;
  reviewed_at: string | null;
  review_comment: string | null;
};
type BatchRow = {
  batchId: string | null;
  compound: string | null;
  slotLabel: string | null;
  day3Status: string;
  day7Status: string;
};
type SterilityDetails = {
  ftm_lot_number: string | null;
  tsb_lot_number: string | null;
  inoculation_volume_ml: number;
  incubators: Array<{ unit_name: string; temperature_c: number | null }>;
};

const STATUS_LABEL: Record<string, string> = { pending: "Pending", clear: "No Growth", turbid: "Positive" };

export function exportAnalysisBatchPdf(
  batch: BatchHeader,
  rows: BatchRow[],
  details: SterilityDetails,
  names: { performedBy: string | null; reviewedBy: string | null },
) {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Letterhead
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 70, "F");
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, 22, 130, 39);
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Record of Analysis", W - margin, 46, { align: "right" });
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(1);
  doc.line(margin, 72, W - margin, 72);

  let y = 90;
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Analysis Batch ${batch.batch_number}`, margin, y);
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, W - margin, y);
  y += 20;

  // Batch information
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BATCH INFORMATION", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const info: [string, string][] = [
    ["Test Type", batch.test_type],
    ["Method", batch.method ?? "—"],
    ["Status", batch.status.replace("_", " ").toUpperCase()],
    ["Analyst", names.performedBy ?? "—"],
    ["Date/Time", new Date(batch.performed_at).toLocaleString()],
    ["FTM Lot", details.ftm_lot_number ?? "—"],
    ["TSB Lot", details.tsb_lot_number ?? "—"],
    ["Inoculation Volume", `${details.inoculation_volume_ml}mL each`],
    ["Placed in Incubator", batch.incubation_started_at ? new Date(batch.incubation_started_at).toLocaleString() : "—"],
    ["Incubator(s)", (details.incubators ?? []).map(i => `${i.unit_name}${i.temperature_c != null ? ` @ ${i.temperature_c}°C` : ""}`).join(", ") || "—"],
  ];
  info.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k + ":", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 130, y);
    y += 13;
  });

  // Sample table
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("SAMPLES", margin, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [["Batch ID", "Compound", "Tray", "Day 3", "Day 7"]],
    body: rows.map(r => [
      r.batchId ?? "—", r.compound ?? "—", r.slotLabel ?? "—",
      STATUS_LABEL[r.day3Status] ?? r.day3Status, STATUS_LABEL[r.day7Status] ?? r.day7Status,
    ]),
    styles: { fontSize: 8, font: "helvetica" },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  // Signatures
  const afterTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let sigY = afterTableY + 50;
  if (sigY > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); sigY = 80; }

  const colW = (W - margin * 2 - 20) / 2;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("ANALYST", margin, sigY);
  doc.text("REVIEWER / APPROVER", margin + colW + 20, sigY);
  sigY += 30;
  doc.setDrawColor(150);
  doc.line(margin, sigY, margin + colW, sigY);
  doc.line(margin + colW + 20, sigY, margin + colW * 2 + 20, sigY);
  sigY += 12;
  doc.setFont("helvetica", "normal");
  doc.text(names.performedBy || "—", margin, sigY);
  doc.text(names.reviewedBy || "—", margin + colW + 20, sigY);
  sigY += 12;
  doc.setTextColor(120);
  doc.text(`Date: ${new Date(batch.performed_at).toLocaleDateString()}`, margin, sigY);
  doc.text(`Date: ${batch.reviewed_at ? new Date(batch.reviewed_at).toLocaleDateString() : "—"}`, margin + colW + 20, sigY);
  if (batch.review_comment) {
    sigY += 16;
    doc.setFontSize(7);
    doc.text(`Review comment: ${batch.review_comment}`, margin, sigY);
  }

  // Footer
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()} • Synthesyx • ${batch.batch_number}`, margin, doc.internal.pageSize.getHeight() - 20);

  doc.save(`${batch.batch_number}.pdf`);
}

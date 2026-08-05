/**
 * Client-side PDF generator for Certificates of Analysis (COA). Builds a multi-page jsPDF document from sample/batch data, including chromatogram thumbnails and result tables.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Peak } from "./lims-utils";
import { SYNTHESYX_LOGO_PNG_BASE64 } from "@/assets/synthesyx-logo-base64";
import { purityVerdict } from "@/lib/lims/spec-verdict";

export interface CoaInput {
  sample: { batch_id: string; client: string; project?: string | null; receipt_date: string; notes?: string | null };
  test: { method_name: string; instrument: string; parameters?: Record<string, unknown> | null; spec_min?: number | null; spec_max?: number | null };
  result: { purity_percentage?: number | null; analysis_date: string; peak_details: Peak[] };
  analyst?: string | null;
  reviewer?: string | null;
  approved_at?: string | null;
}

export function generateCoaPdf(data: CoaInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Letterhead
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 70, "F");
  // Logo (aspect ~3.33:1)
  doc.addImage(SYNTHESYX_LOGO_PNG_BASE64, "PNG", margin, 22, 130, 39);
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Certificate of Analysis", W - margin, 46, { align: "right" });
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(1);
  doc.line(margin, 72, W - margin, 72);

  let y = 90;
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Certificate of Analysis", margin, y);
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, W - margin, y);
  y += 20;

  // Sample info
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SAMPLE INFORMATION", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const info: [string, string][] = [
    ["Batch ID", data.sample.batch_id],
    ["Client", data.sample.client],
    ["Project", data.sample.project || "—"],
    ["Receipt Date", data.sample.receipt_date],
    ["Method", data.test.method_name],
    ["Instrument", data.test.instrument],
    ["Analysis Date", new Date(data.result.analysis_date).toLocaleString()],
  ];
  info.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k + ":", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 100, y);
    y += 13;
  });

  // Purity summary
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("PURITY SUMMARY", margin, y);
  y += 14;
  const verdict = purityVerdict(data.result.purity_percentage ?? null, {
    spec_min: data.test.spec_min ?? null, spec_max: data.test.spec_max ?? null,
  });
  doc.setFontSize(20);
  doc.setTextColor(...(verdict === "fail" ? [220, 38, 38] as const : [5, 150, 105] as const));
  doc.text(
    data.result.purity_percentage != null ? `${Number(data.result.purity_percentage).toFixed(3)} %` : "N/A",
    margin, y
  );
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(verdict === "fail" ? [220, 38, 38] as const : verdict === "pass" ? [5, 150, 105] as const : [120, 120, 120] as const));
  doc.text(
    verdict === "pass" ? "PASS" : verdict === "fail" ? "FAIL" : "No acceptance criteria on file",
    margin, y
  );
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "normal");
  y += 18;

  // Peak table
  doc.setFont("helvetica", "bold");
  doc.text("PEAK DETAILS", margin, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [["Peak ID", "RT (min)", "Area", "Area %", "Identity", "S/N"]],
    body: (data.result.peak_details || []).map(p => [
      p.peak_id, p.rt?.toFixed(3) ?? "—", p.area?.toFixed(1) ?? "—",
      p.area_pct?.toFixed(3) ?? "—", p.identity ?? "—", p.sn?.toFixed(1) ?? "—"
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
  doc.text(data.analyst || "—", margin, sigY);
  doc.text(data.reviewer || "—", margin + colW + 20, sigY);
  sigY += 12;
  doc.setTextColor(120);
  doc.text(`Date: ${new Date(data.result.analysis_date).toLocaleDateString()}`, margin, sigY);
  doc.text(`Date: ${data.approved_at ? new Date(data.approved_at).toLocaleDateString() : "—"}`, margin + colW + 20, sigY);

  // Footer
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()} • Synthesyx • Batch ${data.sample.batch_id}`, margin, doc.internal.pageSize.getHeight() - 20);

  return doc;
}

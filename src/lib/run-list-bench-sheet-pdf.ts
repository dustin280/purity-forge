import jsPDF from "jspdf";
import { wrapPdf } from "@/lib/pdf-text";
import type { BenchSheet, BenchSheetRow } from "@/lib/run-lists/bench-sheet.functions";

type ListHeader = { id: string; name: string; instrument_id: string | null; method_name: string | null; created_at: string };

/**
 * Render a one-shot PDF of a run list's bench sheet ("Record of Analysis").
 * Kept in a separate module so the heavy jsPDF dependency only loads when
 * the user actually exports — same reasoning as standard-preparation-pdf.ts,
 * whose plain line-based layout this mirrors rather than using autotable.
 */
export function exportBenchSheetPdf(
  list: ListHeader,
  sheet: BenchSheet,
  rows: BenchSheetRow[],
  names: { performedBy: string | null; reviewedBy: string | null },
) {
  const doc = wrapPdf(new jsPDF({ compress: true }));
  let y = 14;
  const line = (text: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10);
    const wrapped = doc.splitTextToSize(text, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * (opts?.size ?? 10) * 0.45 + 2;
    if (y > 280) { doc.addPage(); y = 14; }
  };

  line("Record of Analysis — Bench Sheet", { bold: true, size: 16 });
  line(sheet.document_number, { bold: true, size: 10 });
  line(list.name, { size: 10 });
  y += 2;
  line(`Instrument: ${list.instrument_id ?? "—"} · Method: ${list.method_name ?? "—"}`);
  line(`Status: ${sheet.status.replace("_", " ").toUpperCase()}`);
  line(`Performed by: ${names.performedBy ?? "—"}${sheet.performed_at ? ` on ${new Date(sheet.performed_at).toLocaleString()}` : ""}`);
  if (sheet.run_started_at) line(`Run started: ${new Date(sheet.run_started_at).toLocaleString()}`);
  if (sheet.run_completed_at) line(`Run completed: ${new Date(sheet.run_completed_at).toLocaleString()}`);
  y += 2;

  line("Samples", { bold: true });
  rows.forEach((r) => {
    line(`${r.rowNo}. ${r.batchId ?? r.sampleType}${r.compound ? ` — ${r.compound}` : ""}${r.vial ? ` (vial ${r.vial})` : ""}`);
    if (r.prepSummary) line(`   Prep: ${r.prepSummary}`);
    if (r.comment) line(`   Remarks: ${r.comment}`);
  });

  y += 2;
  line("Observations", { bold: true });
  line(sheet.narrative?.trim() || "—");
  if (sheet.deviation_flag) {
    y += 2;
    line("Deviation Noted", { bold: true });
    line(sheet.deviation_notes?.trim() || "—");
  }

  y += 2;
  line("Review & Sign-off", { bold: true });
  line(`Reviewed by: ${names.reviewedBy ?? "—"}${sheet.reviewed_at ? ` on ${new Date(sheet.reviewed_at).toLocaleString()}` : ""}`);
  if (sheet.review_comment) line(`Review comment: ${sheet.review_comment}`);

  doc.save(`${sheet.document_number}.pdf`);
}

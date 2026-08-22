import jsPDF from "jspdf";

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
type BatchRow = { batchId: string | null; compound: string | null; slotLabel: string | null };
type SterilityDetails = {
  ftm_lot_number: string | null;
  tsb_lot_number: string | null;
  inoculation_volume_ml: number;
  incubators: Array<{ unit_name: string; temperature_c: number | null }>;
};

/**
 * Render a one-shot PDF "Record of Analysis" for an analysis batch — same
 * plain line-based jsPDF pattern as standard-preparation-pdf.ts and
 * run-list-bench-sheet-pdf.ts.
 */
export function exportAnalysisBatchPdf(
  batch: BatchHeader,
  rows: BatchRow[],
  details: SterilityDetails,
  names: { performedBy: string | null; reviewedBy: string | null },
) {
  const doc = new jsPDF();
  let y = 14;
  const line = (text: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 10);
    const wrapped = doc.splitTextToSize(text, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * (opts?.size ?? 10) * 0.45 + 2;
    if (y > 280) { doc.addPage(); y = 14; }
  };

  line("Record of Analysis — Analysis Batch", { bold: true, size: 16 });
  line(batch.batch_number, { size: 10 });
  y += 2;
  line(`Test type: ${batch.test_type} · Method: ${batch.method ?? "—"}`);
  line(`Status: ${batch.status.replace("_", " ").toUpperCase()}`);
  line(`Analyst: ${names.performedBy ?? "—"} on ${new Date(batch.performed_at).toLocaleString()}`);
  line(`FTM lot: ${details.ftm_lot_number ?? "—"} · TSB lot: ${details.tsb_lot_number ?? "—"} · Volume: ${details.inoculation_volume_ml}mL each`);
  (details.incubators ?? []).forEach((i) => line(`Incubator: ${i.unit_name}${i.temperature_c != null ? ` @ ${i.temperature_c}°C` : ""}`));
  if (batch.incubation_started_at) line(`Placed in incubator: ${new Date(batch.incubation_started_at).toLocaleString()}`);
  y += 2;

  line("Samples", { bold: true });
  rows.forEach((r) => {
    line(`${r.batchId ?? "—"}${r.compound ? ` — ${r.compound}` : ""}${r.slotLabel ? ` (${r.slotLabel})` : ""}`);
  });

  y += 2;
  line("Review & Sign-off", { bold: true });
  line(`Reviewed by: ${names.reviewedBy ?? "—"}${batch.reviewed_at ? ` on ${new Date(batch.reviewed_at).toLocaleString()}` : ""}`);
  if (batch.review_comment) line(`Review comment: ${batch.review_comment}`);

  doc.save(`${batch.batch_number}.pdf`);
}

import jsPDF from "jspdf";
import { STATUS_LABEL } from "@/lib/lims-utils";
import type { StandardPrepRow } from "@/lib/standard-preparations.functions";

export type LinkedReceipt = {
  id: string;
  receipt_number: string;
  internal_lot: string | null;
  manufacturer_lot: string | null;
  material_name: string;
} | null;

/**
 * Render a one-shot PDF summary of a standard preparation log. Kept in a
 * separate module so the heavy jsPDF dependency only loads when the user
 * actually exports.
 */
export function exportPrepPdf(r: StandardPrepRow, linked: LinkedReceipt, attachmentCount: number) {
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
  line("Standard Preparation Log", { bold: true, size: 16 });
  line(r.log_number, { size: 10 });
  if (r.syn_id) line(`SYX ID: ${r.syn_id}`, { bold: true });
  y += 2;
  line(`Standard: ${r.standard_name}`, { bold: true, size: 12 });
  line(`Status: ${STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]?.toUpperCase() ?? r.status.toUpperCase()}`);
  line(`Prepared: ${new Date(r.prepared_at).toLocaleString()}`);
  line(`Analyst: ${r.analyst_name}`);
  if (r.target_concentration) line(`Target concentration: ${r.target_concentration}`);
  if (r.final_volume) line(`Final volume: ${r.final_volume}`);
  if (r.solvent) line(`Solvent: ${r.solvent}`);
  if (r.manufacturer_lot) line(`Manufacturer lot: ${r.manufacturer_lot}`);
  if (r.ref_material_name) line(`Reference material: ${r.ref_material_name}${r.ref_lot ? ` (lot ${r.ref_lot})` : ""}`);
  if (r.ref_form === "liquid") {
    if (r.ref_concentration_mg_per_ml != null) line(`Stock concentration: ${r.ref_concentration_mg_per_ml} mg/mL`);
  } else if (r.ref_purity_percent != null) {
    line(`Reference purity: ${r.ref_purity_percent}%`);
  }
  if (linked) line(`Linked receipt: ${linked.receipt_number} — ${linked.material_name}${linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}`);
  y += 2;
  if (r.preparation_steps?.length) {
    line("Steps", { bold: true });
    r.preparation_steps.forEach(s => {
      line(`${s.step_no}. ${s.description || "—"}`);
      const meta = [s.amount && `Amount: ${s.amount}`, s.instrument_id && `Instr: ${s.instrument_id}`, s.time && `Time: ${s.time}`].filter(Boolean).join(" · ");
      if (meta) line(`   ${meta}`);
    });
  }
  if (r.mixing_details) { y += 2; line("Mixing:", { bold: true }); line(r.mixing_details); }
  if (r.appearance_notes) { y += 2; line("Appearance:", { bold: true }); line(r.appearance_notes); }
  y += 2;
  line("Storage", { bold: true });
  if (r.expiration_date) line(`Expiration: ${r.expiration_date}`);
  if (r.storage_condition) line(`Condition: ${r.storage_condition}`);
  if (r.storage_location) line(`Location: ${r.storage_location}`);
  if (r.container_label) line(`Container: ${r.container_label}`);
  y += 2;
  line("Review & Approval", { bold: true });
  line(`In Review by: ${r.reviewer_name ?? "—"}${r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleString()}` : ""}`);
  line(`Approved by: ${r.approver_name ?? "—"}${r.approved_at ? ` on ${new Date(r.approved_at).toLocaleString()}` : ""}`);
  if (r.notes) { y += 2; line("Notes:", { bold: true }); line(r.notes); }
  line(`Attachments on file: ${attachmentCount}`);
  doc.save(`${r.syn_id ?? r.log_number}.pdf`);
}
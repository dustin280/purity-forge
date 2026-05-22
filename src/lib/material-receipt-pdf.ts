import type { MaterialReceiptRow } from "@/lib/material-receipts.functions";

/**
 * Generates a PDF summary for a single material receipt and triggers a download.
 * Lives in src/lib/ so the route file stays presentation-only and the heavy
 * jspdf imports are loaded lazily at call time.
 */
export async function exportMaterialReceiptPdf(r: MaterialReceiptRow) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait" });
  doc.setFontSize(16);
  doc.text(`Material Receipt — ${r.receipt_number}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 24);

  const common: Array<[string, string]> = [
    ["Material type", r.material_type],
    ["Received at", new Date(r.received_at).toLocaleString()],
    ["Receiver", r.receiver_name],
    ["Material", r.material_name],
    ["Quantity", r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"],
    ["Supplier", r.supplier ?? "—"],
    ["PO / Invoice", r.po_number ?? "—"],
    ["Freight tracking #", r.freight_tracking_number ?? "—"],
    ["Notes", r.notes ?? "—"],
  ];
  autoTable(doc, { startY: 30, head: [["Field", "Value"]], body: common, styles: { fontSize: 9 } });

  if (r.material_type === "controlled") {
    const controlled: Array<[string, string]> = [
      ["Manufacturer", r.manufacturer ?? "—"],
      ["Mfr. lot", r.manufacturer_lot ?? "—"],
      ["Catalog #", r.catalog_number ?? "—"],
      ["Expiry / retest", r.expiry_date ?? "—"],
      ["Container", r.container_details ?? "—"],
      ["COA attached", r.coa_attached ? "Yes" : "No"],
      ["SDS attached", r.sds_attached ? "Yes" : "No"],
      ["Visual inspection", r.visual_inspection ?? "—"],
      ["Inspection notes", r.visual_inspection_notes ?? "—"],
      ["Temp on receipt", r.temperature_on_receipt != null ? `${r.temperature_on_receipt} °C` : "—"],
      ["Internal lot", r.internal_lot ?? "—"],
      ["Storage", r.storage_location ?? "—"],
      ["Quarantine status", r.quarantine_status],
      ["QC pass/fail", r.qc_pass == null ? "—" : r.qc_pass ? "Pass" : "Fail"],
      ["QC analyst", r.qc_analyst ?? "—"],
      ["QC date", r.qc_date ?? "—"],
      ["QC results", r.qc_results ?? "—"],
      ["Approved at", r.approved_at ? new Date(r.approved_at).toLocaleString() : "Pending"],
      ["Approver", r.approver_name ?? "—"],
    ];
    autoTable(doc, { head: [["Controlled-material details", ""]], body: controlled, styles: { fontSize: 9 } });
  } else {
    autoTable(doc, { head: [["Field", "Value"]], body: [["Purpose", r.purpose ?? "—"]], styles: { fontSize: 9 } });
  }

  doc.save(`${r.receipt_number}.pdf`);
}
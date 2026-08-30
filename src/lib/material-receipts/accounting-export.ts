import { wrapPdf } from "@/lib/pdf-text";
import type { AccountingReportRow } from "./receipts-crud.functions";

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function lineTotal(r: AccountingReportRow): number {
  const t =
    r.total_price ??
    (r.unit_price != null && r.quantity != null ? r.unit_price * r.quantity : 0);
  return Number(t) + Number(r.tax_amount ?? 0) + Number(r.shipping_cost ?? 0);
}

export function downloadAccountingCsv(rows: AccountingReportRow[], filename: string) {
  const header = [
    "Receipt #",
    "Type",
    "Received",
    "Invoice date",
    "Invoice #",
    "PO #",
    "Supplier",
    "Manufacturer",
    "Material",
    "Quantity",
    "Unit",
    "Unit price",
    "Total price",
    "Tax",
    "Shipping",
    "Grand total",
    "Currency",
    "GL / Cost center",
    "Receiver",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.receipt_number,
        r.material_type,
        r.received_at.slice(0, 10),
        r.invoice_date ?? "",
        r.invoice_number ?? "",
        r.po_number ?? "",
        r.supplier ?? "",
        r.manufacturer ?? "",
        r.material_name,
        r.quantity ?? "",
        r.unit ?? "",
        r.unit_price ?? "",
        r.total_price ?? "",
        r.tax_amount ?? "",
        r.shipping_cost ?? "",
        lineTotal(r).toFixed(2),
        r.currency ?? "USD",
        r.gl_account ?? "",
        r.receiver_name,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAccountingPdf(
  rows: AccountingReportRow[],
  opts: { from: string; to: string; filename: string; dateField: string },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = wrapPdf(new jsPDF({ orientation: "landscape", compress: true }));

  doc.setFontSize(16);
  doc.text("Material Receipts — Accounting Report", 14, 16);
  doc.setFontSize(10);
  doc.text(`${opts.dateField}: ${opts.from} → ${opts.to}`, 14, 22);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 27);

  // Sum per currency
  const sums = new Map<string, number>();
  for (const r of rows) {
    const c = r.currency ?? "USD";
    sums.set(c, (sums.get(c) ?? 0) + lineTotal(r));
  }
  const totalsText = Array.from(sums.entries())
    .map(([c, v]) => `${c} ${v.toFixed(2)}`)
    .join("   ");
  doc.text(`Totals: ${totalsText || "—"}`, 14, 32);

  autoTable(doc, {
    startY: 37,
    head: [[
      "Receipt #",
      "Received",
      "Invoice #",
      "Inv. date",
      "PO #",
      "Supplier",
      "Material",
      "Qty",
      "Unit $",
      "Total",
      "Tax",
      "Ship",
      "Grand",
      "Cur",
      "GL",
    ]],
    body: rows.map((r) => [
      r.receipt_number,
      r.received_at.slice(0, 10),
      r.invoice_number ?? "",
      r.invoice_date ?? "",
      r.po_number ?? "",
      r.supplier ?? "",
      r.material_name,
      r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "",
      r.unit_price ?? "",
      r.total_price ?? "",
      r.tax_amount ?? "",
      r.shipping_cost ?? "",
      lineTotal(r).toFixed(2),
      r.currency ?? "USD",
      r.gl_account ?? "",
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40] },
  });

  doc.save(opts.filename);
}
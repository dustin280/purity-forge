/**
 * Read-only summary cards for the material receipt detail page: the always-
 * shown "Receipt" card, plus a "Manufacturer & Storage" card and a "QC &
 * Approval" card that only appear for controlled materials. Pure rendering
 * over a typed subset of the receipt row.
 */
import { Card } from "@/components/ui/card";
import { InfoRow } from "@/components/material-receipts/info-row";

type ReceiptDetail = {
  material_type: string;
  received_at: string;
  receiver_name: string;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  po_number: string | null;
  freight_tracking_number: string | null;
  purpose: string | null;
  notes: string | null;
  manufacturer: string | null;
  manufacturer_lot: string | null;
  catalog_number: string | null;
  expiry_date: string | null;
  container_details: string | null;
  internal_lot: string | null;
  storage_location: string | null;
  temperature_on_receipt: number | null;
  visual_inspection: string | null;
  visual_inspection_notes: string | null;
  qc_pass: boolean | null;
  qc_analyst: string | null;
  qc_date: string | null;
  qc_results: string | null;
  approved_at: string | null;
  approver_name: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  gl_account: string | null;
  tax_amount: number | null;
  shipping_cost: number | null;
};

export function ReceiptInfoCards({ r }: { r: ReceiptDetail }) {
  const isControlled = r.material_type === "controlled";
  const hasFinancials =
    r.unit_price != null ||
    r.total_price != null ||
    r.invoice_number ||
    r.invoice_date ||
    r.gl_account ||
    r.tax_amount != null ||
    r.shipping_cost != null;
  const grand = (() => {
    const t = r.total_price ?? (r.unit_price != null && r.quantity != null ? r.unit_price * r.quantity : null);
    if (t == null) return null;
    return t + (r.tax_amount ?? 0) + (r.shipping_cost ?? 0);
  })();
  const cur = r.currency ?? "USD";
  return (
    <>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-5 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Receipt</h2>
          <InfoRow label="Received" value={new Date(r.received_at).toLocaleString()} />
          <InfoRow label="Receiver" value={r.receiver_name} />
          <InfoRow label="Quantity" value={r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"} />
          <InfoRow label="Supplier" value={r.supplier} />
          <InfoRow label="PO / Invoice" value={r.po_number} />
          <InfoRow label="Freight tracking #" value={r.freight_tracking_number} />
          {!isControlled && <InfoRow label="Purpose" value={r.purpose} />}
          {r.notes && <InfoRow label="Notes" value={r.notes} multiline />}
        </Card>

        {isControlled && (
          <Card className="p-5 space-y-2 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Manufacturer & Storage</h2>
            <InfoRow label="Manufacturer" value={r.manufacturer} />
            <InfoRow label="Mfr. lot" value={r.manufacturer_lot} />
            <InfoRow label="Catalog #" value={r.catalog_number} />
            <InfoRow label="Expiry" value={r.expiry_date} />
            <InfoRow label="Container" value={r.container_details} />
            <InfoRow label="Internal lot" value={r.internal_lot} />
            <InfoRow label="Storage" value={r.storage_location} />
            <InfoRow label="Temp on receipt" value={r.temperature_on_receipt != null ? `${r.temperature_on_receipt} °C` : null} />
            <InfoRow label="Visual inspection" value={r.visual_inspection} />
            {r.visual_inspection_notes && <InfoRow label="Inspection notes" value={r.visual_inspection_notes} multiline />}
          </Card>
        )}
      </div>

      {hasFinancials && (
        <Card className="p-5 mb-6 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Financial / Accounting
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <InfoRow label="Unit price" value={r.unit_price != null ? `${r.unit_price} ${cur}` : null} />
              <InfoRow label="Total price" value={r.total_price != null ? `${r.total_price} ${cur}` : null} />
              <InfoRow label="Tax" value={r.tax_amount != null ? `${r.tax_amount} ${cur}` : null} />
              <InfoRow label="Shipping" value={r.shipping_cost != null ? `${r.shipping_cost} ${cur}` : null} />
              {grand != null && <InfoRow label="Grand total" value={`${grand.toFixed(2)} ${cur}`} />}
            </div>
            <div className="space-y-2">
              <InfoRow label="Invoice #" value={r.invoice_number} />
              <InfoRow label="Invoice date" value={r.invoice_date} />
              <InfoRow label="GL / Cost center" value={r.gl_account} />
            </div>
          </div>
        </Card>
      )}

      {isControlled && (
        <Card className="p-5 mb-6 space-y-2 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">QC & Approval</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <InfoRow label="QC pass/fail" value={r.qc_pass == null ? "—" : r.qc_pass ? "Pass" : "Fail"} />
              <InfoRow label="QC analyst" value={r.qc_analyst} />
              <InfoRow label="QC date" value={r.qc_date} />
              {r.qc_results && <InfoRow label="QC results" value={r.qc_results} multiline />}
            </div>
            <div className="space-y-2">
              <InfoRow label="Approved at" value={r.approved_at ? new Date(r.approved_at).toLocaleString() : "Pending"} />
              <InfoRow label="Approver" value={r.approver_name} />
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
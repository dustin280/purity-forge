import { ReceiptForm, valuesToPayload, type ReceiptFormValues, type PendingAttachments } from "./receipt-form";

type ReceiptRow = {
  receipt_number: string;
  material_type: string;
  received_at: string;
  receiver_name: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  po_number: string | null;
  notes: string | null;
  freight_tracking_number: string | null;
  purpose: string | null;
  manufacturer: string | null;
  manufacturer_lot: string | null;
  catalog_number: string | null;
  expiry_date: string | null;
  container_details: string | null;
  coa_attached: boolean;
  sds_attached: boolean;
  visual_inspection: string | null;
  visual_inspection_notes: string | null;
  temperature_on_receipt: number | null;
  internal_lot: string | null;
  storage_location: string | null;
  quarantine_status: string;
  qc_pass: boolean | null;
  qc_results: string | null;
  qc_analyst: string | null;
  qc_date: string | null;
  purity_percent: number | null;
  molecular_weight: number | null;
  shelf_life_months: number | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  gl_account: string | null;
  tax_amount: number | null;
  shipping_cost: number | null;
};

/** Build initial ReceiptForm values from a server receipt row. */
export function receiptToFormValues(r: ReceiptRow): Partial<ReceiptFormValues> {
  return {
    material_type: r.material_type as ReceiptFormValues["material_type"],
    received_at: r.received_at.slice(0, 16),
    receiver_name: r.receiver_name,
    material_name: r.material_name,
    quantity: r.quantity?.toString() ?? "",
    unit: r.unit ?? "",
    supplier: r.supplier ?? "",
    po_number: r.po_number ?? "",
    notes: r.notes ?? "",
    freight_tracking_number: r.freight_tracking_number ?? "",
    purpose: r.purpose ?? "",
    manufacturer: r.manufacturer ?? "",
    manufacturer_lot: r.manufacturer_lot ?? "",
    catalog_number: r.catalog_number ?? "",
    expiry_date: r.expiry_date ?? "",
    container_details: r.container_details ?? "",
    coa_attached: r.coa_attached,
    sds_attached: r.sds_attached,
    visual_inspection: (r.visual_inspection ?? "") as ReceiptFormValues["visual_inspection"],
    visual_inspection_notes: r.visual_inspection_notes ?? "",
    temperature_on_receipt: r.temperature_on_receipt?.toString() ?? "",
    internal_lot: r.internal_lot ?? "",
    storage_location: r.storage_location ?? "",
    quarantine_status: r.quarantine_status as ReceiptFormValues["quarantine_status"],
    qc_pass: r.qc_pass == null ? "" : r.qc_pass ? "pass" : "fail",
    qc_results: r.qc_results ?? "",
    qc_analyst: r.qc_analyst ?? "",
    qc_date: r.qc_date ?? "",
    purity_percent: r.purity_percent?.toString() ?? "",
    molecular_weight: r.molecular_weight?.toString() ?? "",
    shelf_life_months: r.shelf_life_months?.toString() ?? "",
    unit_price: r.unit_price?.toString() ?? "",
    total_price: r.total_price?.toString() ?? "",
    currency: r.currency ?? "USD",
    invoice_number: r.invoice_number ?? "",
    invoice_date: r.invoice_date ?? "",
    gl_account: r.gl_account ?? "",
    tax_amount: r.tax_amount?.toString() ?? "",
    shipping_cost: r.shipping_cost?.toString() ?? "",
  };
}

/**
 * Edit view for an existing material receipt. Wraps ReceiptForm with the
 * title and submission glue so the route file stays focused on data flow.
 */
export function ReceiptEditView({
  r, submitting, onSubmit, onCancel,
}: {
  r: ReceiptRow;
  submitting: boolean;
  onSubmit: (patch: ReturnType<typeof valuesToPayload>, pending: PendingAttachments) => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight mb-4">Edit {r.receipt_number}</h1>
      <ReceiptForm
        initial={receiptToFormValues(r)}
        defaultReceiverName={r.receiver_name}
        submitting={submitting}
        submitLabel="Save Changes"
        onSubmit={(v, pending) => onSubmit(valuesToPayload(v), pending)}
        onCancel={onCancel}
      />
    </div>
  );
}
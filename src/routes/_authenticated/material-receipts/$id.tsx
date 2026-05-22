import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Pencil, Trash2 } from "lucide-react";
import {
  approveMaterialReceipt,
  deleteMaterialReceipt,
  getMaterialReceipt,
  recordAttachment,
  updateMaterialReceipt,
} from "@/lib/material-receipts.functions";
import {
  ReceiptForm,
  valuesToPayload,
  type ReceiptFormValues,
  type PendingAttachments,
} from "@/components/material-receipts/receipt-form";
import { uploadPending } from "./new";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { InfoRow } from "@/components/material-receipts/info-row";
import { ApproveDialog } from "@/components/material-receipts/approve-dialog";
import { AttachmentsSection } from "@/components/material-receipts/attachments-section";
import { LinkedPreparations } from "@/components/material-receipts/linked-preparations";
import { exportMaterialReceiptPdf } from "@/lib/material-receipt-pdf";

export const Route = createFileRoute("/_authenticated/material-receipts/$id")({
  component: ReceiptDetail,
});

function ReceiptDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile, role } = useAuth();
  const get = useServerFn(getMaterialReceipt);
  const update = useServerFn(updateMaterialReceipt);
  const del = useServerFn(deleteMaterialReceipt);
  const approve = useServerFn(approveMaterialReceipt);
  const record = useServerFn(recordAttachment);

  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.materialReceipts.detail(id),
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: async (args: { patch: ReturnType<typeof valuesToPayload>; pending: PendingAttachments }) => {
      const row = await update({ data: { id, patch: args.patch } });
      await uploadPending(id, args.pending, record);
      return row;
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(id) });
      qc.invalidateQueries({ queryKey: qk.materialReceipts.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Receipt deleted");
      navigate({ to: "/material-receipts" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (args: { approver_name: string; qc_pass: boolean }) =>
      approve({ data: { id, ...args } }),
    onSuccess: () => {
      toast.success("Receipt updated");
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-sm text-destructive">Receipt not found.</div>;

  const r = data.receipt;
  const canEdit = role === "admin" || role === "tech" || role === "reviewer";
  const canApprove = role === "admin" || role === "reviewer";

  if (editing) {
    const initial: Partial<ReceiptFormValues> = {
      material_type: r.material_type,
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
      visual_inspection: r.visual_inspection ?? "",
      visual_inspection_notes: r.visual_inspection_notes ?? "",
      temperature_on_receipt: r.temperature_on_receipt?.toString() ?? "",
      internal_lot: r.internal_lot ?? "",
      storage_location: r.storage_location ?? "",
      quarantine_status: r.quarantine_status,
      qc_pass: r.qc_pass == null ? "" : r.qc_pass ? "pass" : "fail",
      qc_results: r.qc_results ?? "",
      qc_analyst: r.qc_analyst ?? "",
      qc_date: r.qc_date ?? "",
      purity_percent: r.purity_percent?.toString() ?? "",
      molecular_weight: r.molecular_weight?.toString() ?? "",
      shelf_life_months: r.shelf_life_months?.toString() ?? "",
    };
    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Edit {r.receipt_number}</h1>
        <ReceiptForm
          initial={initial}
          defaultReceiverName={r.receiver_name}
          submitting={updateMut.isPending}
          submitLabel="Save Changes"
          onSubmit={(v, pending) => updateMut.mutate({ patch: valuesToPayload(v), pending })}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const isControlled = r.material_type === "controlled";

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/material-receipts">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{r.receipt_number}</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{r.material_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={isControlled ? "default" : "secondary"}>{r.material_type}</Badge>
            {isControlled && (
              <Badge variant={
                r.quarantine_status === "released" ? "default"
                  : r.quarantine_status === "rejected" ? "destructive" : "outline"
              }>
                {r.quarantine_status}
              </Badge>
            )}
            {r.qc_pass != null && (
              <Badge variant={r.qc_pass ? "default" : "destructive"}>QC {r.qc_pass ? "Pass" : "Fail"}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportMaterialReceiptPdf(r)}>
            <FileDown className="size-4 mr-1" /> PDF
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          )}
          {canApprove && isControlled && r.approved_at == null && (
            <ApproveDialog
              defaultName={profileDisplayName(profile, user?.email) || user?.email || ""}
              onApprove={(approver_name, qc_pass) => approveMut.mutate({ approver_name, qc_pass })}
              loading={approveMut.isPending}
            />
          )}
          {role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All attached files will be removed too. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMut.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

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

      <AttachmentsSection receiptId={id} attachments={data.attachments} canEdit={canEdit} />

      <LinkedPreparations receiptId={id} />
    </div>
  );
}
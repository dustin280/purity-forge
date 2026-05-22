import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { AttachmentsSection } from "@/components/material-receipts/attachments-section";
import { LinkedPreparations } from "@/components/material-receipts/linked-preparations";
import { exportMaterialReceiptPdf } from "@/lib/material-receipt-pdf";
import { ReceiptHeader } from "@/components/material-receipts/receipt-header";
import { ReceiptInfoCards } from "@/components/material-receipts/receipt-info-cards";

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

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/material-receipts">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <ReceiptHeader
        r={r}
        canEdit={canEdit}
        canApprove={canApprove}
        isAdmin={role === "admin"}
        approverDefaultName={profileDisplayName(profile, user?.email) || user?.email || ""}
        onPdf={() => exportMaterialReceiptPdf(r)}
        onEdit={() => setEditing(true)}
        onApprove={(approver_name, qc_pass) => approveMut.mutate({ approver_name, qc_pass })}
        onDelete={() => deleteMut.mutate()}
        approving={approveMut.isPending}
      />

      <ReceiptInfoCards r={r} />

      <AttachmentsSection receiptId={id} attachments={data.attachments} canEdit={canEdit} />

      <LinkedPreparations receiptId={id} />
    </div>
  );
}
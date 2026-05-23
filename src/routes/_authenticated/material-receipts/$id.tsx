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
import { valuesToPayload, type PendingAttachments } from "@/components/material-receipts/receipt-form";
import { ReceiptEditView } from "@/components/material-receipts/edit-view";
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
    return (
      <ReceiptEditView
        r={r}
        submitting={updateMut.isPending}
        onSubmit={(patch, pending) => updateMut.mutate({ patch, pending })}
        onCancel={() => setEditing(false)}
      />
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
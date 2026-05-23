import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ReceiptEditView } from "@/components/material-receipts/edit-view";
import { Button } from "@/components/ui/button";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { AttachmentsSection } from "@/components/material-receipts/attachments-section";
import { LinkedPreparations } from "@/components/material-receipts/linked-preparations";
import { exportMaterialReceiptPdf } from "@/lib/material-receipt-pdf";
import { ReceiptHeader } from "@/components/material-receipts/receipt-header";
import { ReceiptInfoCards } from "@/components/material-receipts/receipt-info-cards";
import { useReceiptDetail } from "@/components/material-receipts/use-receipt-detail";

export const Route = createFileRoute("/_authenticated/material-receipts/$id")({
  component: ReceiptDetail,
});

function ReceiptDetail() {
  const { id } = Route.useParams();
  const { user, profile, role } = useAuth();
  const [editing, setEditing] = useState(false);
  const { query, updateMut, deleteMut, approveMut } = useReceiptDetail(id);
  const { data, isLoading, error } = query;

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
        onSubmit={(patch, pending) => updateMut.mutate({ patch, pending }, { onSuccess: () => setEditing(false) })}
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
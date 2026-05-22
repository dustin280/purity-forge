/**
 * Header strip for the material receipt detail page: receipt number, title,
 * status badges, and the action toolbar (PDF, Edit, Approve, Delete). The
 * parent owns mutations and role gating; this component is pure presentation
 * plus the destructive-delete AlertDialog wrapper.
 */
import { FileDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ApproveDialog } from "@/components/material-receipts/approve-dialog";

type ReceiptLite = {
  receipt_number: string;
  material_name: string;
  material_type: string;
  quarantine_status: string;
  qc_pass: boolean | null;
  approved_at: string | null;
};

export function ReceiptHeader({
  r, canEdit, canApprove, isAdmin, approverDefaultName,
  onPdf, onEdit, onApprove, onDelete, approving,
}: {
  r: ReceiptLite;
  canEdit: boolean;
  canApprove: boolean;
  isAdmin: boolean;
  approverDefaultName: string;
  onPdf: () => void;
  onEdit: () => void;
  onApprove: (name: string, qcPass: boolean) => void;
  onDelete: () => void;
  approving: boolean;
}) {
  const isControlled = r.material_type === "controlled";
  return (
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
        <Button variant="outline" size="sm" onClick={onPdf}>
          <FileDown className="size-4 mr-1" /> PDF
        </Button>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-4 mr-1" /> Edit
          </Button>
        )}
        {canApprove && isControlled && r.approved_at == null && (
          <ApproveDialog
            defaultName={approverDefaultName}
            onApprove={onApprove}
            loading={approving}
          />
        )}
        {isAdmin && (
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
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
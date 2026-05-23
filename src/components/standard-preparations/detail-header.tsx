/**
 * Detail-page header for a Standard Preparation: title, log/syn ids, status
 * badges, and the row of contextual actions (PDF, Edit, transitions, Delete).
 * The route owns data + mutations and passes them in as props.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, FileDown, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TransitionDialog } from "./transition-dialog";
import { STATUS_LABEL } from "@/lib/lims-utils";

type RowLike = {
  log_number: string;
  syn_id?: string | null;
  standard_name: string;
  status: string;
  target_concentration?: string | null;
  manufacturer_lot?: string | null;
  batch_group_id?: string | null;
};

export function PrepDetailHeader({
  row, canEdit, canReview, isAdmin, actorName,
  transitionLoading, onEdit, onExportPdf, onTransition, onDelete,
}: {
  row: RowLike;
  canEdit: boolean;
  canReview: boolean;
  isAdmin: boolean;
  actorName: string;
  transitionLoading: boolean;
  onEdit: () => void;
  onExportPdf: () => void;
  onTransition: (target: "reviewed" | "approved" | "draft", actorName: string) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="font-mono text-sm text-muted-foreground">
            {row.log_number}
            {row.syn_id && <span className="ml-2 text-foreground">· {row.syn_id}</span>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{row.standard_name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={row.status === "approved" ? "default" : row.status === "reviewed" ? "secondary" : "outline"}>
              {STATUS_LABEL[row.status as keyof typeof STATUS_LABEL] ?? row.status}
            </Badge>
            {row.target_concentration && <Badge variant="outline">{row.target_concentration}</Badge>}
            {row.manufacturer_lot && <Badge variant="outline">Lot {row.manufacturer_lot}</Badge>}
            {row.batch_group_id && (
              <Link to="/lab-logs/standard-preparations/batch/$groupId" params={{ groupId: row.batch_group_id }}>
                <Badge variant="secondary" className="cursor-pointer">View batch</Badge>
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onExportPdf}>
            <FileDown className="size-4 mr-1" /> PDF
          </Button>
          {canEdit && row.status !== "approved" && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          )}
          {canReview && row.status === "draft" && (
            <TransitionDialog
              label="Mark In Review"
              title="Review preparation"
              actionText="Mark In Review"
              defaultName={actorName}
              loading={transitionLoading}
              onConfirm={name => onTransition("reviewed", name)}
              trigger={<Button size="sm" variant="outline"><Eye className="size-4 mr-1" /> Mark In Review</Button>}
            />
          )}
          {canReview && row.status === "reviewed" && (
            <TransitionDialog
              label="Approve"
              title="Approve preparation"
              actionText="Approve"
              defaultName={actorName}
              loading={transitionLoading}
              onConfirm={name => onTransition("approved", name)}
              trigger={<Button size="sm"><ShieldCheck className="size-4 mr-1" /> Approve</Button>}
            />
          )}
          {canReview && row.status !== "draft" && (
            <Button size="sm" variant="ghost" disabled={transitionLoading}
              onClick={() => onTransition("draft", actorName || "system")}>
              Revert to Draft
            </Button>
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
                  <AlertDialogTitle>Delete this preparation log?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Attached files will also be removed. This cannot be undone.
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
    </>
  );
}
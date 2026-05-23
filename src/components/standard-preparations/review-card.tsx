/**
 * Reviewer/approver attribution + free-form appearance and notes shown
 * beneath the prep steps.
 */
import { Card } from "@/components/ui/card";
import { InfoRow } from "./info-row";

type RowLike = {
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  approver_name?: string | null;
  approved_at?: string | null;
  appearance_notes?: string | null;
  notes?: string | null;
};

export function PrepReviewCard({ row }: { row: RowLike }) {
  return (
    <Card className="p-5 mb-6 space-y-2 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Review & Approval</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <InfoRow label="In Review by" value={row.reviewer_name} />
          <InfoRow label="In Review at" value={row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : null} />
        </div>
        <div className="space-y-2">
          <InfoRow label="Approved by" value={row.approver_name} />
          <InfoRow label="Approved at" value={row.approved_at ? new Date(row.approved_at).toLocaleString() : null} />
        </div>
      </div>
      {row.appearance_notes && <InfoRow label="Appearance" value={row.appearance_notes} multiline />}
      {row.notes && <InfoRow label="Notes" value={row.notes} multiline />}
    </Card>
  );
}
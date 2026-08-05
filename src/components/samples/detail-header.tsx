import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/lims/status-pill";
import { type SampleStatus } from "@/lib/lims-utils";

type Props = {
  batchId: string;
  client: string;
  project: string | null;
  status: SampleStatus;
  busy: boolean;
  onChangeStatus: (status: SampleStatus) => void;
  resultReviewed: boolean;
  resultApproved: boolean;
};

export function SampleDetailHeader({ batchId, client, project, status, busy, onChangeStatus, resultReviewed, resultApproved }: Props) {
  return (
    <>
      <div className="flex items-center text-xs text-muted-foreground gap-1">
        <Link to="/samples" className="hover:text-foreground">Samples</Link>
        <ChevronRight className="size-3" />
        <span className="font-mono">{batchId}</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">{batchId}</h1>
          <p className="text-sm text-muted-foreground mt-1">{client}{project ? ` · ${project}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <div className="flex gap-1.5">
            {status === "received" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus("intake_verified")}>Verify Intake</Button>
            )}
            {status === "intake_verified" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus("prep")}>Start Prep</Button>
            )}
            {status === "prep" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus("in_progress")}>Start Analysis</Button>
            )}
            {status === "in_progress" && (
              <Button size="sm" variant="outline" disabled={busy || !resultReviewed}
                title={resultReviewed ? undefined : "Review the result on the Results tab first"}
                onClick={() => onChangeStatus("reviewed")}>Mark Reviewed</Button>
            )}
            {status === "reviewed" && (
              <Button size="sm" disabled={busy} onClick={() => onChangeStatus("complete")}>Mark Complete</Button>
            )}
            {status === "complete" && (
              <Button size="sm" disabled={busy || !resultApproved}
                title={resultApproved ? undefined : "Approve the result on the Results tab first"}
                onClick={() => onChangeStatus("approved")}>Approve Sample</Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
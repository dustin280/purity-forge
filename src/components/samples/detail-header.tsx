import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/lims/status-pill";
import { SAMPLE_STATUS_TRANSITIONS, STATUS_LABEL, type SampleStatus } from "@/lib/lims-utils";

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
  const next = SAMPLE_STATUS_TRANSITIONS[status] ?? [];

  const actionLabel: Partial<Record<SampleStatus, string>> = {
    intake_verified: "Verify Intake",
    scheduled: "Schedule",
    prep: "Start Prep",
    in_progress: "Start Analysis",
    in_analysis: "Mark In Analysis",
    on_hold: "Put On Hold",
    reviewed: "Mark Reviewed",
    complete: "Mark Complete",
    approved: "Approve Sample",
    cancelled: "Cancel",
    received: "Reopen",
  };

  function blockedReason(target: SampleStatus): string | undefined {
    if (target === "reviewed" && !resultReviewed) return "Review the result on the Results tab first";
    if (target === "approved" && !resultApproved) return "Approve the result on the Results tab first";
    return undefined;
  }

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
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <StatusPill status={status} />
            <div className="flex gap-1.5 flex-wrap justify-end">
              {next.map((target, i) => {
                const reason = blockedReason(target);
                const destructive = target === "cancelled";
                return (
                  <Button
                    key={target}
                    size="sm"
                    variant={destructive ? "ghost" : i === 0 ? "default" : "outline"}
                    className={destructive ? "text-destructive hover:text-destructive" : undefined}
                    disabled={busy || !!reason}
                    title={reason}
                    onClick={() => onChangeStatus(target)}
                  >
                    {actionLabel[target] ?? STATUS_LABEL[target]}
                  </Button>
                );
              })}
              {next.length === 0 && (
                <span className="text-xs text-muted-foreground">No further steps — sample is final.</span>
              )}
            </div>
          </div>
          {next.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Next step{next.length > 1 ? "s" : ""}: {next.map(s => STATUS_LABEL[s]).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
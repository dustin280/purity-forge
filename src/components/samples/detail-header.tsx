import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/lims/status-pill";
import {
  SAMPLE_STATUS_TRANSITIONS, CANONICAL_STATUS_FOR_DISPLAY, DISPLAY_STATUS_LABEL,
  toDisplayStatus, type SampleStatus, type DisplayStatus,
} from "@/lib/lims-utils";

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

const BUCKET_ACTION_LABEL: Record<DisplayStatus, string> = {
  received: "Reopen",
  in_progress: "Start Work",
  on_hold: "Put On Hold",
  in_review: "Mark In Review",
  complete: "Complete",
  cancelled: "Cancel",
};

export function SampleDetailHeader({ batchId, client, project, status, busy, onChangeStatus, resultReviewed, resultApproved }: Props) {
  const rawNext = SAMPLE_STATUS_TRANSITIONS[status] ?? [];

  // Group the raw next-states by their simplified display bucket (several
  // raw values collapse to one bucket — e.g. prep/scheduled/in_analysis all
  // display as "In Progress") and render exactly one button per bucket,
  // writing the canonical raw value for that bucket when it's a legal
  // target, falling back to whichever raw value is actually allowed.
  const byBucket = new Map<DisplayStatus, SampleStatus>();
  for (const raw of rawNext) {
    const bucket = toDisplayStatus(raw);
    if (!byBucket.has(bucket) || raw === CANONICAL_STATUS_FOR_DISPLAY[bucket]) {
      byBucket.set(bucket, raw);
    }
  }
  const next = Array.from(byBucket.entries());

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
              {next.map(([bucket, raw], i) => {
                const reason = blockedReason(raw);
                const destructive = bucket === "cancelled";
                return (
                  <Button
                    key={bucket}
                    size="sm"
                    variant={destructive ? "ghost" : i === 0 ? "default" : "outline"}
                    className={destructive ? "text-destructive hover:text-destructive" : undefined}
                    disabled={busy || !!reason}
                    title={reason}
                    onClick={() => onChangeStatus(raw)}
                  >
                    {BUCKET_ACTION_LABEL[bucket]}
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
              Next step{next.length > 1 ? "s" : ""}: {next.map(([bucket]) => DISPLAY_STATUS_LABEL[bucket]).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
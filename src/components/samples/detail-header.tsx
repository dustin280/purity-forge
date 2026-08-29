import { Link } from "@tanstack/react-router";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * How far along the happy path each bucket sits. The furthest-forward legal
 * step is the one button that stays on screen; everything else moves into a
 * menu.
 *
 * This header sits above every tab, including Results. A sample sitting in
 * prep therefore showed "Start Work" as a full-size primary button directly
 * over the results being entered -- a workflow-bookkeeping action given the
 * same weight, and the same corner of the screen, as the Complete button
 * that eventually appears there. One is routine, the other finishes a
 * sample; they should not look alike or share a hit area.
 */
const BUCKET_ORDER: Record<DisplayStatus, number> = {
  cancelled: -2,
  on_hold: -1,
  received: 0,
  in_progress: 1,
  in_review: 2,
  complete: 3,
};

export function SampleDetailHeader({ batchId, client, project, status, busy, onChangeStatus, resultReviewed, resultApproved }: Props) {
  const rawNext = SAMPLE_STATUS_TRANSITIONS[status] ?? [];

  // Group the raw next-states by their simplified display bucket (several
  // raw values collapse to one bucket — e.g. prep/scheduled/in_analysis all
  // display as "In Progress") and render exactly one entry per bucket,
  // writing the canonical raw value for that bucket when it's a legal
  // target, falling back to whichever raw value is actually allowed.
  const byBucket = new Map<DisplayStatus, SampleStatus>();
  for (const raw of rawNext) {
    const bucket = toDisplayStatus(raw);
    if (!byBucket.has(bucket) || raw === CANONICAL_STATUS_FOR_DISPLAY[bucket]) {
      byBucket.set(bucket, raw);
    }
  }
  const next = Array.from(byBucket.entries())
    .sort((a, b) => BUCKET_ORDER[b[0]] - BUCKET_ORDER[a[0]]);

  function blockedReason(target: SampleStatus): string | undefined {
    if (target === "reviewed" && !resultReviewed) return "Review the result on the Results tab first";
    if (target === "approved" && !resultApproved) return "Approve the result on the Results tab first";
    return undefined;
  }

  // Only a step that actually moves the sample forward earns the standing
  // button. "Start Work" on a sample in prep did not: prep and in_progress
  // both display as "In Progress", so the pill was already reading IN
  // PROGRESS and clicking it changed nothing visible -- which is precisely
  // why it looked like a button that does nothing. It still does real work
  // (queues and dashboards read the raw status), so it moves into the menu
  // rather than being deleted, labelled with the change it actually makes.
  const currentBucket = toDisplayStatus(status);
  const isForward = (b: DisplayStatus) => BUCKET_ORDER[b] > BUCKET_ORDER[currentBucket];
  const primary = next.find(([b]) => isForward(b)) ?? null;
  const secondary = next.filter((e) => e !== primary);

  /** Spells out a move the status pill won't visibly reflect. */
  function menuHint(bucket: DisplayStatus, raw: SampleStatus): string | null {
    if (bucket !== currentBucket) return null;
    return `${status.replace(/_/g, " ")} → ${raw.replace(/_/g, " ")}`;
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
              {primary && (() => {
                const [bucket, raw] = primary;
                const reason = blockedReason(raw);
                return (
                  <Button
                    size="sm"
                    disabled={busy || !!reason}
                    title={reason}
                    onClick={() => onChangeStatus(raw)}
                  >
                    {BUCKET_ACTION_LABEL[bucket]}
                  </Button>
                );
              })()}

              {secondary.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={busy}>
                      Change status <ChevronDown className="size-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Move this sample to
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {secondary.map(([bucket, raw]) => {
                      const reason = blockedReason(raw);
                      return (
                        <DropdownMenuItem
                          key={bucket}
                          disabled={!!reason}
                          title={reason}
                          onSelect={() => onChangeStatus(raw)}
                          className={bucket === "cancelled" ? "text-destructive focus:text-destructive" : undefined}
                        >
                          <span className="flex flex-col items-start">
                            <span>{BUCKET_ACTION_LABEL[bucket]}</span>
                            {menuHint(bucket, raw) && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {menuHint(bucket, raw)}
                              </span>
                            )}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

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

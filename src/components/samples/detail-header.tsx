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
};

export function SampleDetailHeader({ batchId, client, project, status, busy, onChangeStatus }: Props) {
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
            {status === "prep" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus("in_progress")}>Start Analysis</Button>
            )}
            {status === "in_progress" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onChangeStatus("reviewed")}>Mark In Review</Button>
            )}
            {status === "reviewed" && (
              <Button size="sm" disabled={busy} onClick={() => onChangeStatus("complete")}>Mark Complete</Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
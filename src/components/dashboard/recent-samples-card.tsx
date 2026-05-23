import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/lims/status-pill";
import { type SampleStatus } from "@/lib/lims-utils";

type Sample = { id: string; batch_id: string; client: string; project: string | null; status: string };

export function RecentSamplesCard({ samples, isLoading }: { samples: Sample[]; isLoading: boolean }) {
  return (
    <Card className="border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Recent Samples</h2>
        <Link to="/samples" className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      <div className="divide-y divide-border">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && samples.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No samples yet. <Link to="/samples/new" className="text-primary underline">Create one</Link>.</div>
        )}
        {samples.map(s => (
          <Link key={s.id} to="/samples/$batchId" params={{ batchId: s.batch_id }}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div>
              <div className="font-mono text-sm font-semibold">{s.batch_id}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.client}{s.project ? ` · ${s.project}` : ""}</div>
            </div>
            <StatusPill status={s.status as SampleStatus} />
          </Link>
        ))}
      </div>
    </Card>
  );
}
/**
 * Reverse lookup for Track A5: which generated sequences used this standard
 * prep to back a QC row (NIB/ICB/LCS/CCB). Only rendered when at least
 * one link exists.
 */
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SequenceUsageEntry = {
  id: string;
  row_no: number;
  sample_type: string;
  run_list: { id: string; name: string; exported_at: string | null } | null;
};

export function SequenceUsageCard({ entries }: { entries: SequenceUsageEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card className="p-5 space-y-3 text-sm mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Used In Sequences</h2>
      <ul className="space-y-1">
        {entries.map(e => (
          <li key={e.id} className="text-xs flex items-center justify-between gap-2 border-b border-dashed py-1 last:border-0">
            <span className="flex items-center gap-2">
              <Badge variant="outline">{e.sample_type}</Badge>
              {e.run_list ? (
                <Link to="/run-lists/$id" params={{ id: e.run_list.id }} className="text-primary hover:underline">
                  {e.run_list.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Deleted sequence</span>
              )}
            </span>
            <span className="text-muted-foreground shrink-0">
              {e.run_list?.exported_at ? new Date(e.run_list.exported_at).toLocaleString() : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FlaskConical } from "lucide-react";
import { STATUS_LABEL } from "@/lib/lims-utils";

type Row = {
  id: string;
  log_number: string;
  syn_id: string | null;
  status: string;
  standard_name: string;
  analyst_name: string;
  prepared_at: string;
  target_concentration: string | null;
  manufacturer_lot: string | null;
};

export function PrepsList({ rows, isLoading }: { rows: Row[]; isLoading: boolean }) {
  if (isLoading) return <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>;
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <FlaskConical className="size-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">No preparation logs yet.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <Link key={r.id} to="/lab-logs/standard-preparations/$id" params={{ id: r.id }} className="block">
          <Card className="p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{r.log_number}</span>
                  {r.syn_id && <span className="font-mono text-xs text-muted-foreground">{r.syn_id}</span>}
                  <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</Badge>
                </div>
                <div className="font-medium mt-1 truncate">{r.standard_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {r.analyst_name} · {new Date(r.prepared_at).toLocaleString()}
                  {r.target_concentration ? ` · ${r.target_concentration}` : ""}
                  {r.manufacturer_lot ? ` · Lot ${r.manufacturer_lot}` : ""}
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
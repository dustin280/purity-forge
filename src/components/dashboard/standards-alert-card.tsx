import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PrepAlertCategory } from "@/lib/standard-preparations/prep-alerts";

type AlertItem = {
  id: string;
  log_number: string;
  standard_name: string;
  category: PrepAlertCategory;
  label: string;
  detail: string;
  className: string;
};

export function StandardsAlertCard({ items, total, isLoading }: { items: AlertItem[]; total: number; isLoading: boolean }) {
  return (
    <Card className="border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Standards Needing Attention</h2>
        <Link to="/lab-logs/standard-preparations" className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      <div className="divide-y divide-border">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && items.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">All standards in good shape.</div>
        )}
        {items.map(item => (
          <Link key={item.id} to="/lab-logs/standard-preparations/$id" params={{ id: item.id }}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{item.standard_name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{item.log_number}</div>
            </div>
            <Badge variant="outline" className={item.className + " shrink-0"}>{item.detail}</Badge>
          </Link>
        ))}
        {!isLoading && total > items.length && (
          <div className="p-3 text-xs text-muted-foreground text-center">
            +{total - items.length} more — <Link to="/lab-logs/standard-preparations" className="text-primary hover:underline">view the full log</Link>
          </div>
        )}
      </div>
    </Card>
  );
}

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditRow, ProfileLite } from "./types";

export function AuditTable({
  rows, actorMap, isLoading, error, onView,
}: {
  rows: AuditRow[];
  actorMap: Map<string, ProfileLite>;
  isLoading: boolean;
  error: unknown;
  onView: (row: AuditRow) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
        {isLoading ? "Loading…" : `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
        {error ? ` · ${(error as Error).message}` : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-left px-4 py-2 font-medium">Table</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-left px-4 py-2 font-medium">Record ID</th>
              <th className="text-left px-4 py-2 font-medium">Changed by</th>
              <th className="text-right px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const p = r.changed_by ? actorMap.get(r.changed_by) : null;
              const actor = p?.full_name || p?.email || r.changed_by || "—";
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.table_name}</td>
                  <td className="px-4 py-2">
                    <Badge variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"}>
                      {r.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{r.record_id ?? "—"}</td>
                  <td className="px-4 py-2">{actor}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onView(r)}>View diff</Button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No audit entries match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
import { Card } from "@/components/ui/card";

type AuditEntry = { id: string; action: string; table_name: string; changed_at: string };

export function AuditStreamCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Audit Stream</h2>
      </div>
      <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
        {entries.length === 0 && <div className="p-4 text-sm text-muted-foreground">No activity yet.</div>}
        {entries.map(a => (
          <div key={a.id} className="p-3 text-xs">
            <div className="font-mono">{a.action}</div>
            <div className="text-muted-foreground mt-0.5">
              {a.table_name} · {new Date(a.changed_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
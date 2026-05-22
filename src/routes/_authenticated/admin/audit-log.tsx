import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/audit-log")({ component: AuditLogAdmin });

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  changed_by: string | null;
  changed_at: string;
  diff: any;
};

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function isoStart(d: string) { return new Date(`${d}T00:00:00`).toISOString(); }
function isoEnd(d: string) { return new Date(`${d}T23:59:59.999`).toISOString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function AuditLogAdmin() {
  const { role } = useAuth();
  const [from, setFrom] = useState<string>(daysAgoStr(7));
  const [to, setTo] = useState<string>(todayStr());
  const [tableFilter, setTableFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: qk.auditLog.list(from, to, tableFilter),
    enabled: role === "admin",
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .gte("changed_at", isoStart(from))
        .lte("changed_at", isoEnd(to))
        .order("changed_at", { ascending: false })
        .limit(1000);
      if (tableFilter.trim()) q = q.ilike("table_name", `%${tableFilter.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const actorIds = useMemo(
    () => Array.from(new Set(rows.map(r => r.changed_by).filter((v): v is string => !!v))),
    [rows]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: qk.auditLog.profiles(actorIds.join(",")),
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const actorMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach(p => m.set(p.id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    if (!actorFilter.trim()) return rows;
    const t = actorFilter.toLowerCase();
    return rows.filter(r => {
      const p = r.changed_by ? actorMap.get(r.changed_by) : null;
      return (p?.full_name ?? "").toLowerCase().includes(t)
        || (p?.email ?? "").toLowerCase().includes(t)
        || (r.changed_by ?? "").toLowerCase().includes(t);
    });
  }, [rows, actorFilter, actorMap]);

  const tables = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))).sort(), [rows]);

  if (role && role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">Admins only.</div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every insert, update, and delete across audited tables. Click a row to inspect the diff.
        </p>
      </div>

      <Card className="p-4 mb-4 grid sm:grid-cols-4 gap-3">
        <div>
          <Label htmlFor="from" className="text-xs">From</Label>
          <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="to" className="text-xs">To</Label>
          <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="table" className="text-xs">Table</Label>
          <Input id="table" placeholder="e.g. samples" value={tableFilter} onChange={e => setTableFilter(e.target.value)} list="audit-tables" />
          <datalist id="audit-tables">
            {tables.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <Label htmlFor="actor" className="text-xs">Actor</Label>
          <Input id="actor" placeholder="name or email" value={actorFilter} onChange={e => setActorFilter(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
          {isLoading ? "Loading…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`}
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
              {filtered.map(r => {
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
                      <Button size="sm" variant="outline" onClick={() => setSelected(r)}>View diff</Button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No audit entries match these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.action} on {selected?.table_name}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {new Date(selected.changed_at).toLocaleString()} · record {selected.record_id ?? "—"}
              </div>
              {selected.action === "UPDATE" && selected.diff?.old && selected.diff?.new ? (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold mb-1">Before</div>
                    <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[60vh]">{JSON.stringify(selected.diff.old, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-1">After</div>
                    <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[60vh]">{JSON.stringify(selected.diff.new, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[70vh]">{JSON.stringify(selected.diff, null, 2)}</pre>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
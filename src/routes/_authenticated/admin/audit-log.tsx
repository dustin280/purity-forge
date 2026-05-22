import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { AuditFiltersCard } from "@/components/admin/audit-log/filters-card";
import { AuditTable } from "@/components/admin/audit-log/audit-table";
import { DiffDialog } from "@/components/admin/audit-log/diff-dialog";
import type { AuditRow, ProfileLite } from "@/components/admin/audit-log/types";
export const Route = createFileRoute("/_authenticated/admin/audit-log")({ component: AuditLogAdmin });

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

      <AuditFiltersCard
        from={from} to={to} tableFilter={tableFilter} actorFilter={actorFilter} tables={tables}
        onFrom={setFrom} onTo={setTo} onTable={setTableFilter} onActor={setActorFilter}
      />
      <AuditTable rows={filtered} actorMap={actorMap} isLoading={isLoading} error={error} onView={setSelected} />
      <DiffDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
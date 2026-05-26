import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { AuditFiltersCard } from "@/components/admin/audit-log/filters-card";
import { AuditTable } from "@/components/admin/audit-log/audit-table";
import { DiffDialog } from "@/components/admin/audit-log/diff-dialog";
import type { AuditRow } from "@/components/admin/audit-log/types";
import { useAuditData } from "@/components/admin/audit-log/use-audit-data";
export const Route = createFileRoute("/_authenticated/admin/audit-log")({ component: AuditLogAdmin });

function AuditLogAdmin() {
  const { role } = useAuth();
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const {
    from, to, tableFilter, actorFilter, tables,
    setFrom, setTo, setTableFilter, setActorFilter,
    filtered, actorMap, isLoading, error,
  } = useAuditData(role === "admin");

  if (role && role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">Admins only.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
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
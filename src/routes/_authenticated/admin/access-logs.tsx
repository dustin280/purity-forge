import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import type { AccessLog } from "@/components/admin/access-logs/types";
import { downloadAccessLogsPdf } from "@/components/admin/access-logs/pdf";
import { AccessLogsFiltersCard } from "@/components/admin/access-logs/filters-card";
import { AccessLogsTable } from "@/components/admin/access-logs/access-logs-table";
export const Route = createFileRoute("/_authenticated/admin/access-logs")({ component: AccessLogsAdmin });

function isoStart(d: string) { return new Date(`${d}T00:00:00`).toISOString(); }
function isoEnd(d: string) { return new Date(`${d}T23:59:59.999`).toISOString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function AccessLogsAdmin() {
  const { role } = useAuth();
  const [from, setFrom] = useState<string>(daysAgoStr(30));
  const [to, setTo] = useState<string>(todayStr());

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: qk.accessLogs.list(from, to),
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_logs")
        .select("*")
        .gte("created_at", isoStart(from))
        .lte("created_at", isoEnd(to))
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AccessLog[];
    },
  });

  const summary = useMemo(() => {
    const logins = rows.filter(r => r.event === "login").length;
    const logouts = rows.filter(r => r.event === "logout").length;
    return { total: rows.length, logins, logouts };
  }, [rows]);

  if (role && role !== "admin") {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <p className="text-sm text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Access Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">User sign-in and sign-out activity. Showing up to 1,000 most recent events in range.</p>
      </div>

      <AccessLogsFiltersCard
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        summary={summary}
        onDownload={() => downloadAccessLogsPdf({ rows, from, to, summary })}
        downloadDisabled={rows.length === 0}
      />

      <AccessLogsTable rows={rows} isLoading={isLoading} error={(error as Error) ?? null} />
    </div>
  );
}
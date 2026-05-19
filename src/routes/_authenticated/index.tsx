import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/lims/status-pill";
import { fmtPct, type SampleStatus } from "@/lib/lims-utils";
import { Beaker, FlaskConical, ClipboardCheck, CheckCircle2, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

function Dashboard() {
  const fn = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });

  const tiles = [
    { label: "Received", value: data?.counts.received ?? 0, icon: Beaker, color: "var(--muted-foreground)" },
    { label: "Prep", value: data?.counts.prep ?? 0, icon: Inbox, color: "var(--status-warning)" },
    { label: "In Progress", value: data?.counts.in_progress ?? 0, icon: FlaskConical, color: "var(--status-warning)" },
    { label: "Reviewed", value: data?.counts.reviewed ?? 0, icon: ClipboardCheck, color: "var(--status-info)" },
    { label: "Complete", value: (data?.counts.complete ?? 0) + (data?.counts.approved ?? 0), icon: CheckCircle2, color: "var(--status-success)" },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1400px]">
      <header>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Operations · Live</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Lab Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time sample workflow and instrument throughput.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(t => (
          <Card key={t.label} className="p-4 border-border">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.label}</div>
                <div className="text-3xl font-bold mt-2 font-mono" style={{ color: t.color }}>{t.value}</div>
              </div>
              <t.icon className="size-5 text-muted-foreground/60" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Average Purity</div>
        <div className="text-4xl font-mono font-bold" style={{ color: "var(--status-success)" }}>
          {data?.avgPurity != null ? fmtPct(data.avgPurity) : "—"}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider">Recent Samples</h2>
            <Link to="/samples" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && (data?.samples.length ?? 0) === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No samples yet. <Link to="/samples/new" className="text-primary underline">Create one</Link>.</div>
            )}
            {data?.samples.map(s => (
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

        <Card className="border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold uppercase tracking-wider">Audit Stream</h2>
          </div>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {(data?.audit ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No activity yet.</div>}
            {data?.audit.map(a => (
              <div key={a.id} className="p-3 text-xs">
                <div className="font-mono">{a.action}</div>
                <div className="text-muted-foreground mt-0.5">
                  {a.table_name} · {new Date(a.changed_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
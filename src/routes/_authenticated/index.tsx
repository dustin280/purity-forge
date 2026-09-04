import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { RecentSamplesCard } from "@/components/dashboard/recent-samples-card";
import { AuditStreamCard } from "@/components/dashboard/audit-stream-card";
import { PressureDailyPeakChart } from "@/components/dashboard/pressure-daily-peak-chart";
import { WorkflowLauncher } from "@/components/dashboard/workflow-launcher";
import { getStandardPrepAlerts } from "@/lib/standard-preparations/prep-alerts.functions";
import { StandardsAlertCard } from "@/components/dashboard/standards-alert-card";
import { LiveInstrumentsCard } from "@/components/dashboard/live-instruments-card";
export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

function Dashboard() {
  const fn = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard.all, queryFn: () => fn() });
  const alertsFn = useServerFn(getStandardPrepAlerts);
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: qk.standardPreps.alerts(),
    queryFn: () => alertsFn(),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-[1400px]">
      <header>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Operations · Live
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Lab Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time sample workflow and instrument throughput.
        </p>
      </header>

      <WorkflowLauncher />

      <LiveInstrumentsCard />

      <PressureDailyPeakChart />

      <StatTiles counts={data?.counts} />

      <StandardsAlertCard
        items={alertsData?.items ?? []}
        total={alertsData?.total ?? 0}
        isLoading={alertsLoading}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <RecentSamplesCard samples={data?.samples ?? []} isLoading={isLoading} />
        <AuditStreamCard entries={data?.audit ?? []} />
      </div>
    </div>
  );
}

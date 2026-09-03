import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChartLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ReadingForm } from "@/components/daily-backpressure/reading-form";
import { ReadingsTable } from "@/components/daily-backpressure/readings-table";
import { useBackpressure } from "@/components/daily-backpressure/use-backpressure";
import { BackpressureTrendChart } from "@/components/daily-backpressure/trend-chart";

export const Route = createFileRoute("/_authenticated/lab-logs/daily-backpressure/")({
  component: BackpressureLog,
});

// Rows arrive three ways: the manual form below, the live instrument feed
// (source = 'live', one row per sequence — see docs/instrument-live-feed.md),
// and, historically, the Drive .dx importer (source = 'auto', retired
// 2026-09-03; archive/drive-pressure-importer/).
function BackpressureLog() {
  const { profile, role } = useAuth();
  const defaultName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";
  const { query, createMut, deleteMut } = useBackpressure();
  const { data: rows = [], isLoading } = query;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Daily Backpressure Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One reading per sequence from the live instrument feed, plus manual entries.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/lab-logs/pressure-log">
            <ChartLine className="size-4 mr-1.5" /> Continuous log
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <BackpressureTrendChart rows={rows} isLoading={isLoading} />
      </div>

      {canCreate && (
        <ReadingForm
          defaultUserName={defaultName}
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
        />
      )}

      <ReadingsTable
        rows={rows}
        isLoading={isLoading}
        isAdmin={isAdmin}
        deleteLoading={deleteMut.isPending}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  );
}

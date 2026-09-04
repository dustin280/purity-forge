import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChartLine } from "lucide-react";
import { addDays, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ReadingForm } from "@/components/daily-backpressure/reading-form";
import { ReadingsTable } from "@/components/daily-backpressure/readings-table";
import { useBackpressure } from "@/components/daily-backpressure/use-backpressure";
import {
  ALL_COLUMNS,
  NO_COLUMN,
  BackpressureDailyChart,
  rangeBounds,
} from "@/components/daily-backpressure/daily-chart";

export const Route = createFileRoute("/_authenticated/lab-logs/daily-backpressure/")({
  component: BackpressureLog,
});

// Rows arrive three ways: the manual form below, the live instrument feed
// (source = 'live', one row per sequence — see docs/instrument-live-feed.md),
// and, historically, the Drive .dx importer (source = 'auto', retired
// 2026-09-03; archive/drive-pressure-importer/). The chart reads a per-day,
// per-column summary of those rows; the table shows the rows themselves for
// the same range.
function BackpressureLog() {
  const { profile, role } = useAuth();
  const defaultName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";

  const [range, setRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    return { from: startOfDay(addDays(to, -29)), to };
  });
  const [column, setColumn] = useState(ALL_COLUMNS);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const bounds = rangeBounds(range);
  const filters = bounds
    ? {
        ...bounds,
        // "" asks for rows with no column recorded; null for every row
        column: column === ALL_COLUMNS ? null : column === NO_COLUMN ? "" : column,
      }
    : null;
  const { query, createMut, deleteMut } = useBackpressure(filters);
  const rows = query.data?.rows ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
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
            One reading per sequence from the live instrument feed, plus manual entries, summarised
            per day and column.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/lab-logs/pressure-log">
            <ChartLine className="size-4 mr-1.5" /> Continuous log
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <BackpressureDailyChart
          range={range}
          onRangeChange={setRange}
          column={column}
          onColumnChange={setColumn}
          tz={tz}
        />
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
        isLoading={query.isLoading}
        isAdmin={isAdmin}
        deleteLoading={deleteMut.isPending}
        onDelete={(id) => deleteMut.mutate(id)}
        truncated={query.data?.truncated ?? false}
      />
    </div>
  );
}

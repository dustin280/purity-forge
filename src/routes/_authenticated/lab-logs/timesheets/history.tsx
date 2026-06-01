import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { PageShell } from "@/components/timesheets/page-shell";
import {
  FiltersCard,
  type FiltersValue,
} from "@/components/timesheets/filters-card";
import { EntriesTable } from "@/components/timesheets/entries-table";
import {
  useTimesheetEntries,
  useTimesheetProjects,
} from "@/components/timesheets/use-timesheets";
import {
  downloadTimesheetCsv,
  downloadTimesheetPdf,
} from "@/lib/timesheet-exports";

export const Route = createFileRoute("/_authenticated/lab-logs/timesheets/history")({
  component: HistoryView,
});

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HistoryView() {
  const { user, profile, role } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || "Unknown";
  const isAdmin = role === "admin";

  const [filters, setFilters] = useState<FiltersValue>({
    from: startOfMonthISO(),
    to: todayISO(),
    project: "",
    q: "",
    mineOnly: true,
  });

  const queryFilters = useMemo(
    () => ({
      from: filters.from || undefined,
      to: filters.to || undefined,
      project: filters.project || undefined,
      q: filters.q || undefined,
      mineOnly: filters.mineOnly,
    }),
    [filters],
  );

  const { data: entries = [], isLoading } = useTimesheetEntries(queryFilters);
  const { data: projects = [] } = useTimesheetProjects();

  const total = entries.reduce((s, e) => s + Number(e.duration_hours || 0), 0);
  const periodLabel = `${filters.from || "…"} → ${filters.to || "…"}`;

  return (
    <PageShell
      title="History"
      description="Browse, filter, and export past entries."
    >
      <FiltersCard
        value={filters}
        onChange={setFilters}
        projects={projects}
        showMineToggle={isAdmin}
        onReset={() =>
          setFilters({
            from: startOfMonthISO(),
            to: todayISO(),
            project: "",
            q: "",
            mineOnly: true,
          })
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
          <span className="font-medium text-foreground tabular-nums">
            {total.toFixed(2)} h
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={entries.length === 0}
            onClick={() =>
              downloadTimesheetCsv(entries, `timesheet_${filters.from}_to_${filters.to}.csv`)
            }
          >
            <Download className="size-4 mr-1" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={entries.length === 0}
            onClick={() =>
              downloadTimesheetPdf(entries, {
                title: "Timesheet",
                subtitle: `${periodLabel}${filters.mineOnly ? ` · ${defaultName}` : ""}`,
                filename: `timesheet_${filters.from}_to_${filters.to}.pdf`,
              })
            }
          >
            <FileText className="size-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <EntriesTable
        rows={entries}
        projects={projects}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
        isLoading={isLoading}
        defaultUserName={defaultName}
      />
    </PageShell>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { PageShell } from "@/components/timesheets/page-shell";
import { SummaryCards } from "@/components/timesheets/summary-cards";
import { EntryForm, type EntryFormValues } from "@/components/timesheets/entry-form";
import { EntriesTable } from "@/components/timesheets/entries-table";
import {
  useTimesheetEntries,
  useTimesheetMutations,
  useTimesheetProjects,
} from "@/components/timesheets/use-timesheets";

export const Route = createFileRoute("/_authenticated/lab-logs/timesheets/")({
  component: TimesheetsDashboard,
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function TimesheetsDashboard() {
  const { user, profile, role } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || "Unknown";
  const isAdmin = role === "admin";

  const filters = useMemo(() => ({ from: startOfMonthISO(), mineOnly: true }), []);
  const { data: entries = [], isLoading } = useTimesheetEntries(filters);
  const { data: projects = [] } = useTimesheetProjects();
  const { createMut } = useTimesheetMutations();
  const [showForm, setShowForm] = useState(true);

  const today = todayISO();
  const todaysEntries = entries.filter((e) => e.entry_date === today);

  const handleSubmit = (v: EntryFormValues) => {
    createMut.mutate(v);
  };

  return (
    <PageShell
      title="Timesheets"
      description="Track your daily work, calculate totals, and export reports."
    >
      <SummaryCards entries={entries} />

      {showForm && (
        <div className="mb-4">
          <EntryForm
            defaultUserName={defaultName}
            defaultDate={today}
            projects={projects}
            loading={createMut.isPending}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      {!showForm && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-sm text-primary hover:underline"
          >
            + Add new entry
          </button>
        </div>
      )}

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Today's entries</h2>
        <div className="text-sm text-muted-foreground">
          {todaysEntries.length} {todaysEntries.length === 1 ? "entry" : "entries"} ·{" "}
          {todaysEntries
            .reduce((s, e) => s + Number(e.duration_hours || 0), 0)
            .toFixed(2)}{" "}
          h
        </div>
      </div>
      <EntriesTable
        rows={todaysEntries}
        projects={projects}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
        isLoading={isLoading}
        defaultUserName={defaultName}
      />
    </PageShell>
  );
}
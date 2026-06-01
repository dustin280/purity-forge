import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/timesheets/page-shell";
import { EntryForm, type EntryFormValues } from "@/components/timesheets/entry-form";
import { EntriesTable } from "@/components/timesheets/entries-table";
import {
  useTimesheetEntries,
  useTimesheetMutations,
  useTimesheetProjects,
} from "@/components/timesheets/use-timesheets";

export const Route = createFileRoute("/_authenticated/lab-logs/timesheets/daily")({
  component: DailyView,
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DailyView() {
  const { user, profile, role } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || "Unknown";
  const isAdmin = role === "admin";

  const [date, setDate] = useState<string>(todayISO());
  const filters = useMemo(
    () => ({ from: date, to: date, mineOnly: true }),
    [date],
  );
  const { data: entries = [], isLoading } = useTimesheetEntries(filters);
  const { data: projects = [] } = useTimesheetProjects();
  const { createMut } = useTimesheetMutations();

  const total = entries.reduce((s, e) => s + Number(e.duration_hours || 0), 0);

  const handleSubmit = (v: EntryFormValues) => createMut.mutate(v);

  return (
    <PageShell
      title="Daily entries"
      description="Pick a date to view and edit that day's entries."
    >
      <div className="grid sm:grid-cols-[200px_1fr] gap-3 items-end mb-4">
        <div className="grid gap-1.5">
          <Label htmlFor="day-pick">Date</Label>
          <Input
            id="day-pick"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {total.toFixed(2)} h
          </span>{" "}
          across {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
      </div>

      <div className="mb-4">
        <EntryForm
          defaultUserName={defaultName}
          defaultDate={date}
          projects={projects}
          loading={createMut.isPending}
          onSubmit={handleSubmit}
          compact
        />
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
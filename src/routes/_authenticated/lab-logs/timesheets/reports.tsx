import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileText } from "lucide-react";
import { PageShell } from "@/components/timesheets/page-shell";
import { useTimesheetEntries } from "@/components/timesheets/use-timesheets";
import {
  downloadTimesheetCsv,
  downloadTimesheetPdf,
} from "@/lib/timesheet-exports";
import type { TimesheetEntry } from "@/lib/timesheets.functions";

export const Route = createFileRoute("/_authenticated/lab-logs/timesheets/reports")({
  component: ReportsView,
});

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function ReportsView() {
  const { user, profile, role } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || "Unknown";
  const isAdmin = role === "admin";

  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [mineOnly, setMineOnly] = useState(true);

  const filters = useMemo(
    () => ({ from, to, mineOnly }),
    [from, to, mineOnly],
  );
  const { data: entries = [] } = useTimesheetEntries(filters);

  const total = entries.reduce((s, e) => s + Number(e.duration_hours || 0), 0);

  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.project, (map.get(e.project) ?? 0) + Number(e.duration_hours || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const byWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const k = weekKey(e.entry_date);
      map.set(k, (map.get(k) ?? 0) + Number(e.duration_hours || 0));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.entry_date, (map.get(e.entry_date) ?? 0) + Number(e.duration_hours || 0));
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const periodLabel = `${from} → ${to}`;

  return (
    <PageShell title="Reports" description="Weekly and project breakdowns for a period.">
      <Card className="mb-4">
        <CardContent className="pt-4 grid sm:grid-cols-4 gap-3 items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="r-from">From</Label>
            <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-to">To</Label>
            <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={mineOnly} onCheckedChange={(c) => setMineOnly(Boolean(c))} />
              Only mine
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={entries.length === 0}
              onClick={() =>
                downloadTimesheetCsv(entries, `timesheet_${from}_to_${to}.csv`)
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
                  title: "Timesheet report",
                  subtitle: `${periodLabel}${mineOnly ? ` · ${defaultName}` : ""}`,
                  filename: `timesheet_${from}_to_${to}.pdf`,
                })
              }
            >
              <FileText className="size-4 mr-1" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tabular-nums">
              {total.toFixed(2)}
              <span className="text-base font-normal text-muted-foreground ml-1">h</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By week</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={byWeek} formatLabel={(k) => `Week of ${k}`} max={maxOf(byWeek)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By project</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown rows={byProject} max={maxOf(byProject)} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">By day</CardTitle>
        </CardHeader>
        <CardContent>
          <Breakdown rows={byDay} max={maxOf(byDay)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function maxOf(rows: Array<[string, number]>): number {
  return rows.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
}

function Breakdown({
  rows,
  max,
  formatLabel,
}: {
  rows: Array<[string, number]>;
  max: number;
  formatLabel?: (k: string) => string;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No data.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="truncate">{formatLabel ? formatLabel(k) : k}</span>
            <span className="tabular-nums font-medium">{v.toFixed(2)} h</span>
          </div>
          <div className="h-1.5 rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// silence unused entry import on some builds
export type _Entry = TimesheetEntry;
import { Card, CardContent } from "@/components/ui/card";
import type { TimesheetEntry } from "@/lib/timesheets.functions";

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // shift so Monday = 0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

export function SummaryCards({ entries }: { entries: TimesheetEntry[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);
  const weekStart = startOfWeek(today);

  let dayHrs = 0;
  let weekHrs = 0;
  let monthHrs = 0;
  for (const e of entries) {
    const d = parseDate(e.entry_date);
    const h = Number(e.duration_hours || 0);
    if (e.entry_date === todayISO) dayHrs += h;
    if (d >= weekStart) weekHrs += h;
    if (sameMonth(d, today)) monthHrs += h;
  }

  const tiles = [
    { label: "Today", value: dayHrs },
    { label: "This week", value: weekHrs },
    { label: "This month", value: monthHrs },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t.label}
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {t.value.toFixed(2)}
              <span className="text-sm text-muted-foreground font-normal ml-1">h</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
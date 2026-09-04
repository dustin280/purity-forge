import { useMemo } from "react";
import { CalendarIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listBackpressureDailySummary } from "@/lib/daily-backpressure.functions";
import { listPressureDailyByColumn } from "@/lib/instrument-feed.functions";
import { listHplcColumns } from "@/lib/hplc-columns.functions";
import { qk } from "@/lib/query-keys";

/**
 * Daily Backpressure, one point per day per column, read from the continuous
 * per-minute pressure log the way the dashboard's daily peak chart is: each
 * day's highest logged pressure while the pump was delivering, with the time
 * it happened, first/last and entry count in the tooltip. Injections per day
 * (right axis) come from the per-sequence rows, which stay the audit record
 * and are listed below the chart.
 */

export const ALL_COLUMNS = "__all__";
/** entries logged before any column record was seen */
export const NO_COLUMN = "__none__";

const SERIES_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.15 173)",
  "oklch(0.72 0.17 50)",
  "oklch(0.6 0.2 290)",
  "oklch(0.62 0.22 12)",
];

type Point = Record<string, number | string | null>;

function columnKey(name: string | null): string {
  return name ?? NO_COLUMN;
}
function columnLabel(name: string | null): string {
  return name ?? "No column recorded";
}
function localMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function fmtBar(v: unknown): string {
  return typeof v === "number" ? v.toFixed(1) : "—";
}
function fmtClock(iso: unknown): string {
  return typeof iso === "string" ? format(new Date(iso), "HH:mm") : "";
}

export function rangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Pick a date range";
  if (range.to && range.to.getTime() !== range.from.getTime())
    return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
  return format(range.from, "MMM d, yyyy");
}

/** [from, to) ISO bounds of a picked range, whole local days. */
export function rangeBounds(range: DateRange | undefined): { from: string; to: string } | null {
  if (!range?.from) return null;
  return {
    from: startOfDay(range.from).toISOString(),
    to: startOfDay(addDays(range.to ?? range.from, 1)).toISOString(),
  };
}

function DayTooltip({
  active,
  payload,
  label,
  columns,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Point }>;
  label?: unknown;
  columns: Array<[string, string]>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-1.5 max-w-[22rem]">
      <div className="font-medium">{format(new Date(Number(label)), "EEE, MMM d, yyyy")}</div>
      {columns.map(([key, name]) =>
        p[`${key}:peak`] == null ? null : (
          <div key={key} className="space-y-0.5">
            {columns.length > 1 && <div className="text-muted-foreground truncate">{name}</div>}
            <div>
              Peak <span className="font-mono">{fmtBar(p[`${key}:peak`])} bar</span> at{" "}
              {fmtClock(p[`${key}:peak_at`])}
              <span className="text-muted-foreground">
                {" "}
                (minute mean {fmtBar(p[`${key}:peak_mean`])})
              </span>
            </div>
            <div className="text-muted-foreground">
              first {fmtBar(p[`${key}:first`])} at {fmtClock(p[`${key}:first_at`])} · last{" "}
              {fmtBar(p[`${key}:last`])} at {fmtClock(p[`${key}:last_at`])} ·{" "}
              {String(p[`${key}:readings`] ?? "")} min logged
            </div>
            {p[`${key}:sequences`] != null && (
              <div className="text-muted-foreground">
                {String(p[`${key}:sequences`])} sequence
                {p[`${key}:sequences`] === 1 ? "" : "s"} · {String(p[`${key}:injections`])}{" "}
                injections
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

export function BackpressureDailyChart({
  range,
  onRangeChange,
  column,
  onColumnChange,
  tz,
}: {
  range: DateRange | undefined;
  onRangeChange: (r: DateRange | undefined) => void;
  /** ALL_COLUMNS, NO_COLUMN, or a column name */
  column: string;
  onColumnChange: (c: string) => void;
  tz: string;
}) {
  const bounds = rangeBounds(range);
  const window_ = bounds ? { ...bounds, tz } : null;

  // Pressure per day and column from the continuous log; every column is
  // fetched so the selector can list them, the filter is applied client-side.
  const dailyFn = useServerFn(listPressureDailyByColumn);
  const { data: daily = [], isLoading } = useQuery({
    queryKey: qk.backpressure.dailyByColumn(window_),
    queryFn: () => {
      if (!window_) throw new Error("Pick a date range");
      return dailyFn({ data: { ...window_, pump_on_only: true } });
    },
    enabled: window_ !== null,
  });
  // Sequences and injections per day and column from the rows (the record).
  const summaryFn = useServerFn(listBackpressureDailySummary);
  const { data: summary = [] } = useQuery({
    queryKey: qk.backpressure.daily(window_),
    queryFn: () => {
      if (!window_) throw new Error("Pick a date range");
      return summaryFn({ data: window_ });
    },
    enabled: window_ !== null,
  });

  const listCols = useServerFn(listHplcColumns);
  const { data: hplcColumns = [] } = useQuery({
    queryKey: qk.hplcColumns.list(),
    queryFn: () => listCols(),
  });

  const columnOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of daily) seen.set(columnKey(r.column_name), columnLabel(r.column_name));
    for (const r of summary) seen.set(columnKey(r.column_name), columnLabel(r.column_name));
    return [...seen.entries()].sort((a, b) =>
      a[0] === NO_COLUMN ? 1 : b[0] === NO_COLUMN ? -1 : a[1].localeCompare(b[1]),
    );
  }, [daily, summary]);
  const effectiveColumn = columnOptions.some(([k]) => k === column) ? column : ALL_COLUMNS;
  const wanted = (key: string) => effectiveColumn === ALL_COLUMNS || key === effectiveColumn;

  const { points, columns, days } = useMemo(() => {
    const byDay = new Map<number, Point>();
    const names = new Map<string, string>();
    for (const r of daily) {
      const key = columnKey(r.column_name);
      if (!wanted(key)) continue;
      names.set(key, columnLabel(r.column_name));
      const t = localMidnight(r.day);
      const p = byDay.get(t) ?? { t, injections: 0 };
      // Several instruments on one column in one day: the higher peak wins.
      if (p[`${key}:peak`] == null || r.max_bar > Number(p[`${key}:peak`])) {
        p[`${key}:peak`] = r.max_bar;
        p[`${key}:peak_at`] = r.max_at;
        p[`${key}:peak_mean`] = r.max_mean_bar;
      }
      if (p[`${key}:first_at`] == null || r.first_at < String(p[`${key}:first_at`])) {
        p[`${key}:first`] = r.first_bar;
        p[`${key}:first_at`] = r.first_at;
      }
      if (p[`${key}:last_at`] == null || r.last_at > String(p[`${key}:last_at`])) {
        p[`${key}:last`] = r.last_bar;
        p[`${key}:last_at`] = r.last_at;
      }
      p[`${key}:readings`] = Number(p[`${key}:readings`] ?? 0) + r.readings;
      byDay.set(t, p);
    }
    for (const r of summary) {
      const key = columnKey(r.column_name);
      if (!wanted(key)) continue;
      const t = localMidnight(r.day);
      const p = byDay.get(t);
      if (!p) continue; // a day with rows but no pump-on log entries: nothing to plot
      p[`${key}:sequences`] = Number(p[`${key}:sequences`] ?? 0) + r.sequences;
      p[`${key}:injections`] = Number(p[`${key}:injections`] ?? 0) + r.injections;
      p.injections = Number(p.injections) + r.injections;
    }
    const points = [...byDay.values()].sort((a, b) => Number(a.t) - Number(b.t));
    return { points, columns: [...names.entries()], days: points.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, summary, effectiveColumn]);

  const ratedMax =
    effectiveColumn === ALL_COLUMNS || effectiveColumn === NO_COLUMN
      ? null
      : (hplcColumns.find((c) => c.name === effectiveColumn)?.rated_max_pressure_bar ?? null);
  const hasInjections = points.some((p) => Number(p.injections) > 0);
  const single = columns.length === 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Backpressure by Day</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Highest logged pressure each day per column, from the continuous log while the pump
              was delivering · {days} day{days === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={effectiveColumn} onValueChange={onColumnChange}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="All columns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COLUMNS}>All columns</SelectItem>
                {columnOptions.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 justify-start text-left font-normal",
                    !range && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {rangeLabel(range)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={onRangeChange}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : points.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
            No live pressure entries in this date range. The agent logs one entry per minute while
            the instrument is on.
          </div>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => format(Number(v), "MMM d")}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  domain={["auto", "auto"]}
                  width={56}
                  label={{
                    value: "bar",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "var(--muted-foreground)" },
                  }}
                />
                {hasInjections && (
                  <YAxis
                    yAxisId="injections"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                    label={{
                      value: "Injections / day",
                      angle: 90,
                      position: "insideRight",
                      style: { fontSize: 11, fill: "var(--muted-foreground)" },
                    }}
                  />
                )}
                <Tooltip content={<DayTooltip columns={columns} />} isAnimationActive={false} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {ratedMax != null && (
                  <ReferenceLine
                    y={ratedMax}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Rated max (${ratedMax} bar)`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--destructive)",
                    }}
                  />
                )}
                {columns.map(([key, name], i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={`${key}:peak`}
                    name={single ? "Daily peak" : `${name} · peak`}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                {hasInjections && (
                  <Line
                    yAxisId="injections"
                    type="monotone"
                    dataKey="injections"
                    name="Injections / day"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 3"
                    strokeWidth={1.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

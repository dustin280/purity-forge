import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getInstrumentPressureDailyBookends,
  listInstrumentLiveOverview,
  listPressureLogColumns,
} from "@/lib/instrument-feed.functions";
import { listHplcColumns } from "@/lib/hplc-columns.functions";
import { qk } from "@/lib/query-keys";

/**
 * Dashboard chart: each day's highest logged pressure (the peak inside the
 * per-minute log entries) over a trailing window — a static daily sample of
 * the live feed, not the live feed itself. Only entries logged while the pump
 * was delivering count. Filterable by instrument and by the column the
 * instrument reported at the time. Source: instrument_pressure_log via
 * instrument_pressure_daily_bookends().
 */

const SERIES_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.15 173)",
  "oklch(0.72 0.17 50)",
  "oklch(0.6 0.2 290)",
  "oklch(0.62 0.22 12)",
];
const DAY_OPTIONS = [14, 30, 60, 90];
const DAY_MS = 86_400_000;
const ALL = "__all__";

type Point = Record<string, number | string | null>;

/** [local midnight `days` ago, local midnight tomorrow) */
function windowFor(days: number): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from, to };
}

function localMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function fmtClock(iso: unknown): string {
  return typeof iso === "string" ? format(new Date(iso), "HH:mm") : "";
}

function fmtBar(v: unknown): string {
  return typeof v === "number" ? v.toFixed(1) : "—";
}

function PeakTooltip({
  active,
  payload,
  label,
  instruments,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Point }>;
  label?: unknown;
  instruments: Array<[string, string]>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-1.5">
      <div className="font-medium">{format(new Date(Number(label)), "EEE, MMM d, yyyy")}</div>
      {instruments.map(([id, name]) =>
        p[`${id}:peak`] == null ? null : (
          <div key={id} className="space-y-0.5">
            {instruments.length > 1 && <div className="text-muted-foreground">{name}</div>}
            <div>
              Peak <span className="font-mono">{fmtBar(p[`${id}:peak`])} bar</span> at{" "}
              {fmtClock(p[`${id}:peak_at`])}
              <span className="text-muted-foreground">
                {" "}
                (minute mean {fmtBar(p[`${id}:peak_mean`])})
              </span>
            </div>
            <div className="text-muted-foreground">
              {String(p[`${id}:readings`] ?? "")} entries · first {fmtBar(p[`${id}:first`])} at{" "}
              {fmtClock(p[`${id}:first_at`])} · last {fmtBar(p[`${id}:last`])} at{" "}
              {fmtClock(p[`${id}:last_at`])}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function PressureDailyPeakChart() {
  const [days, setDays] = useState(30);
  const [instrumentId, setInstrumentId] = useState(ALL);
  const [column, setColumn] = useState(ALL);
  const { from, to } = useMemo(() => windowFor(days), [days]);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const overviewFn = useServerFn(listInstrumentLiveOverview);
  const { data: overview = [] } = useQuery({
    queryKey: qk.instrumentFeed.overview(),
    queryFn: () => overviewFn(),
  });

  const windowParams = {
    from: from.toISOString(),
    to: to.toISOString(),
    instrument_id: instrumentId === ALL ? null : instrumentId,
  };
  const columnsFn = useServerFn(listPressureLogColumns);
  const { data: columns = [] } = useQuery({
    queryKey: qk.instrumentFeed.pressureLogColumns(windowParams),
    queryFn: () => columnsFn({ data: windowParams }),
    refetchInterval: 5 * 60_000,
  });
  // A column picked earlier may not exist in a narrower window: fall back to all.
  const effectiveColumn = columns.some((c) => c.column_name === column) ? column : ALL;

  const hplcFn = useServerFn(listHplcColumns);
  const { data: hplcColumns = [] } = useQuery({
    queryKey: qk.hplcColumns.list(),
    queryFn: () => hplcFn(),
  });
  const ratedMax =
    effectiveColumn === ALL
      ? null
      : (hplcColumns.find((c) => c.name === effectiveColumn)?.rated_max_pressure_bar ?? null);

  const params = {
    ...windowParams,
    tz,
    pump_on_only: true,
    column: effectiveColumn === ALL ? null : effectiveColumn,
  };
  const fn = useServerFn(getInstrumentPressureDailyBookends);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.instrumentFeed.bookends(params),
    queryFn: () => fn({ data: params }),
    refetchInterval: 5 * 60_000,
  });

  const { points, instruments } = useMemo(() => {
    const byDay = new Map<number, Point>();
    const names = new Map<string, string>();
    for (const r of rows) {
      names.set(r.instrument_id, r.instrument_name);
      const t = localMidnight(r.day);
      const p = byDay.get(t) ?? { t };
      p[`${r.instrument_id}:peak`] = r.max_bar;
      p[`${r.instrument_id}:peak_at`] = r.max_at;
      p[`${r.instrument_id}:peak_mean`] = r.max_mean_bar;
      p[`${r.instrument_id}:first`] = r.first_bar;
      p[`${r.instrument_id}:first_at`] = r.first_at;
      p[`${r.instrument_id}:last`] = r.last_bar;
      p[`${r.instrument_id}:last_at`] = r.last_at;
      p[`${r.instrument_id}:readings`] = r.readings;
      byDay.set(t, p);
    }
    return {
      points: [...byDay.values()].sort((a, b) => Number(a.t) - Number(b.t)),
      instruments: [...names.entries()],
    };
  }, [rows]);

  // One tick every few days, on local midnights, so labels never repeat.
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(days / 8));
    const out: number[] = [];
    for (let i = 0; i < days; i += step) out.push(from.getTime() + i * DAY_MS);
    return out;
  }, [days, from]);

  const single = instruments.length === 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Backpressure · Daily Peak</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Highest logged pressure each day while the pump was delivering · last {days} days
              {effectiveColumn !== ALL ? ` · ${effectiveColumn}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {overview.length > 1 && (
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="All instruments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All instruments</SelectItem>
                  {overview.map((o) => (
                    <SelectItem key={o.instrument.id} value={o.instrument.id}>
                      {o.instrument.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {columns.length > 0 && (
              <Select value={effectiveColumn} onValueChange={setColumn}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="All columns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All columns</SelectItem>
                  {columns.map((c) => (
                    <SelectItem key={c.column_name} value={c.column_name}>
                      {c.column_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[110px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link to="/lab-logs/pressure-log">
                <ExternalLink className="size-4" /> Open Log
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : points.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
            No live pressure entries in the last {days} days
            {effectiveColumn !== ALL ? ` for ${effectiveColumn}` : ""}. The agent logs one entry per
            minute while the instrument is on.
          </div>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[from.getTime(), to.getTime() - DAY_MS / 2]}
                  ticks={ticks}
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
                <Tooltip
                  content={<PeakTooltip instruments={instruments} />}
                  isAnimationActive={false}
                />
                {!single && <Legend wrapperStyle={{ fontSize: 11 }} />}
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
                {instruments.map(([id, name], i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={`${id}:peak`}
                    name={single ? "Daily peak" : `${name} · peak`}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

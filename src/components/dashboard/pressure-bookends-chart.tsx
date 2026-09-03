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
} from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";

/**
 * Dashboard chart: the first and last continuous-log pressure entry of each
 * day (viewer's local day) over a trailing window — a static daily sample of
 * the live feed, not the live feed itself. Only entries logged while the pump
 * was delivering count. Source: instrument_pressure_log via
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

function BookendTooltip({
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
        p[`${id}:first`] == null ? null : (
          <div key={id} className="space-y-0.5">
            {instruments.length > 1 && <div className="text-muted-foreground">{name}</div>}
            <div>
              First ({fmtClock(p[`${id}:first_at`])}):{" "}
              <span className="font-mono">{fmtBar(p[`${id}:first`])} bar</span>
            </div>
            <div>
              Last ({fmtClock(p[`${id}:last_at`])}):{" "}
              <span className="font-mono">{fmtBar(p[`${id}:last`])} bar</span>
            </div>
            <div className="text-muted-foreground">
              {String(p[`${id}:readings`] ?? "")} entries · {fmtBar(p[`${id}:min`])} –{" "}
              {fmtBar(p[`${id}:max`])} bar
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function PressureBookendsChart() {
  const [days, setDays] = useState(30);
  const [instrumentId, setInstrumentId] = useState("__all__");
  const { from, to } = useMemo(() => windowFor(days), [days]);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const overviewFn = useServerFn(listInstrumentLiveOverview);
  const { data: overview = [] } = useQuery({
    queryKey: qk.instrumentFeed.overview(),
    queryFn: () => overviewFn(),
  });

  const params = {
    from: from.toISOString(),
    to: to.toISOString(),
    tz,
    instrument_id: instrumentId === "__all__" ? null : instrumentId,
    pump_on_only: true,
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
      p[`${r.instrument_id}:first`] = r.first_bar;
      p[`${r.instrument_id}:first_at`] = r.first_at;
      p[`${r.instrument_id}:last`] = r.last_bar;
      p[`${r.instrument_id}:last_at`] = r.last_at;
      p[`${r.instrument_id}:readings`] = r.readings;
      p[`${r.instrument_id}:min`] = r.min_bar;
      p[`${r.instrument_id}:max`] = r.max_bar;
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
            <CardTitle className="text-base">Backpressure · Daily First / Last</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              First and last logged pressure each day while the pump was delivering · last {days}{" "}
              days
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overview.length > 1 && (
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="All instruments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instruments</SelectItem>
                  {overview.map((o) => (
                    <SelectItem key={o.instrument.id} value={o.instrument.id}>
                      {o.instrument.name}
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
            No live pressure entries in the last {days} days. The agent logs one entry per minute
            while the instrument is on.
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
                  content={<BookendTooltip instruments={instruments} />}
                  isAnimationActive={false}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {instruments.map(([id, name], i) => {
                  const color = SERIES_COLORS[i % SERIES_COLORS.length];
                  return [
                    <Line
                      key={`${id}:first`}
                      type="monotone"
                      dataKey={`${id}:first`}
                      name={single ? "First reading" : `${name} · First`}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />,
                    <Line
                      key={`${id}:last`}
                      type="monotone"
                      dataKey={`${id}:last`}
                      name={single ? "Last reading" : `${name} · Last`}
                      stroke={color}
                      strokeDasharray="5 3"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />,
                  ];
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

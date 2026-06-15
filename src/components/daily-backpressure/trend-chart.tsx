import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BackpressureRow } from "@/lib/daily-backpressure.functions";

const SERIES_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.15 173)",
  "oklch(0.72 0.17 50)",
  "oklch(0.6 0.2 290)",
  "oklch(0.62 0.22 12)",
];

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BackpressureTrendChart({
  rows,
  isLoading,
}: {
  rows: BackpressureRow[];
  isLoading?: boolean;
}) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 13);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  });

  const { data, instruments, unit, count } = useMemo(() => {
    const fromMs = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : -Infinity;
    const toMs = range?.to
      ? new Date(range.to).setHours(23, 59, 59, 999)
      : range?.from
        ? new Date(range.from).setHours(23, 59, 59, 999)
        : Infinity;
    const filtered = rows.filter((r) => {
      const t = new Date(r.reading_at).getTime();
      return t >= fromMs && t <= toMs;
    });
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime(),
    );
    const instrumentsSet = new Set<string>();
    sorted.forEach((r) => instrumentsSet.add(r.instrument));
    const instruments = Array.from(instrumentsSet);
    const data = sorted.map((r) => {
      const point: Record<string, number | null> = {
        t: new Date(r.reading_at).getTime(),
      };
      for (const inst of instruments) {
        point[inst] = inst === r.instrument ? r.backpressure : null;
      }
      return point;
    });
    const unit = sorted[0]?.backpressure_unit ?? "";
    return {
      data,
      instruments,
      unit,
      count: sorted.length,
    };
  }, [rows, range]);

  const rangeLabel = range?.from
    ? range.to && range.to.getTime() !== range.from.getTime()
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : format(range.from, "MMM d, yyyy")
    : "Pick a date range";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Backpressure Trend</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {count} reading{count === 1 ? "" : "s"}
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("justify-start text-left font-normal", !range && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 size-4" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
            No readings in this date range.
          </div>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  label={
                    unit
                      ? {
                          value: unit,
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 11, fill: "var(--muted-foreground)" },
                        }
                      : undefined
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => fmtDateTime(Number(v))}
                  formatter={(value: number, name: string) => [
                    `${value}${unit ? ` ${unit}` : ""}`,
                    name,
                  ]}
                />
                {instruments.length > 1 && (
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                )}
                {instruments.map((inst, i) => (
                  <Line
                    key={inst}
                    type="monotone"
                    dataKey={inst}
                    name={inst}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls
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
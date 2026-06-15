import { useMemo } from "react";
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
import type { BackpressureRow } from "@/lib/daily-backpressure.functions";

const SERIES_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 27 87% 67%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
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
  const { data, instruments, unit, rangeLabel } = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime(),
    );
    const instrumentsSet = new Set<string>();
    const data = sorted.map((r) => {
      instrumentsSet.add(r.instrument);
      return {
        t: new Date(r.reading_at).getTime(),
        [r.instrument]: r.backpressure,
      } as Record<string, number>;
    });
    const unit = sorted[0]?.backpressure_unit ?? "";
    let rangeLabel = "";
    if (sorted.length > 0) {
      const first = fmtDate(new Date(sorted[0].reading_at).getTime());
      const last = fmtDate(new Date(sorted[sorted.length - 1].reading_at).getTime());
      rangeLabel = first === last ? first : `${first} – ${last}`;
    }
    return {
      data,
      instruments: Array.from(instrumentsSet),
      unit,
      rangeLabel,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Backpressure Trend</CardTitle>
          <div className="text-xs text-muted-foreground">
            {rows.length} reading{rows.length === 1 ? "" : "s"}
            {rangeLabel ? ` · ${rangeLabel}` : ""}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
            No backpressure readings yet.
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
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  label={
                    unit
                      ? {
                          value: unit,
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                        }
                      : undefined
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
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
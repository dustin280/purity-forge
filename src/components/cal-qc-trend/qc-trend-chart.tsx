import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalQcPeakRow, RtReferenceBand } from "@/lib/lab-logs/cal-qc.functions";

const SERIES_COLORS = { cal_std: "var(--primary)", qc_check: "oklch(0.65 0.15 173)" };
const SERIES_LABELS = { cal_std: "Cal Std", qc_check: "QC Check" };

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function metricSeries(rows: CalQcPeakRow[], metric: "rt" | "area") {
  const sorted = [...rows].sort((a, b) => new Date(a.reading_at).getTime() - new Date(b.reading_at).getTime());
  return sorted
    .filter((r) => r[metric] != null)
    .map((r) => ({
      t: new Date(r.reading_at).getTime(),
      [r.sample_type]: r[metric],
      sequence: r.sequence_name,
    }));
}

function MiniChart({
  title,
  unit,
  data,
  rtBand,
}: {
  title: string;
  unit: string;
  data: Array<Record<string, number | string | null>>;
  rtBand?: RtReferenceBand | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No data yet.</div>
        ) : (
          <div className="h-[220px] w-full">
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
                  domain={["auto", "auto"]}
                  label={{ value: unit, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "var(--muted-foreground)" } }}
                />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(v) => fmtDateTime(Number(v))}
                  formatter={(value: number, name: string) => [`${value} ${unit}`, SERIES_LABELS[name as keyof typeof SERIES_LABELS] ?? name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value: string) => SERIES_LABELS[value as keyof typeof SERIES_LABELS] ?? value}
                />
                {rtBand && (
                  <ReferenceArea
                    y1={rtBand.estimated_rt_min - rtBand.rt_window_min}
                    y2={rtBand.estimated_rt_min + rtBand.rt_window_min}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.1}
                    stroke="none"
                    label={{ value: "Expected RT window", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                )}
                <Line type="monotone" dataKey="cal_std" name="cal_std" stroke={SERIES_COLORS.cal_std} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line type="monotone" dataKey="qc_check" name="qc_check" stroke={SERIES_COLORS.qc_check} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function QcTrendChart({
  rows,
  isLoading,
  rtBand,
}: {
  rows: CalQcPeakRow[];
  isLoading?: boolean;
  rtBand?: RtReferenceBand | null;
}) {
  const rtData = useMemo(() => metricSeries(rows, "rt"), [rows]);
  const areaData = useMemo(() => metricSeries(rows, "area"), [rows]);

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <MiniChart title="Retention Time" unit="min" data={rtData} rtBand={rtBand} />
      <MiniChart title="Peak Area" unit="counts" data={areaData} />
    </div>
  );
}

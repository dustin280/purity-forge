import { useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TraceSeries {
  name: string;
  label: string;
  color: string;
  /** run-relative seconds */
  t: number[];
  v: number[];
}

const DAD_COLORS: Record<string, string> = {
  DAD1A: "var(--primary)",
  DAD1B: "oklch(0.65 0.15 173)",
  DAD1C: "oklch(0.72 0.17 50)",
  DAD1D: "oklch(0.6 0.2 290)",
  DAD1E: "oklch(0.62 0.22 12)",
  DAD1F: "oklch(0.7 0.14 120)",
  DAD1G: "oklch(0.6 0.16 230)",
  DAD1H: "oklch(0.55 0.1 330)",
};
const OTHER_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.15 173)",
  "oklch(0.72 0.17 50)",
  "oklch(0.6 0.2 290)",
  "oklch(0.62 0.22 12)",
];

export function colorForStream(name: string, index: number): string {
  return DAD_COLORS[name] ?? OTHER_COLORS[index % OTHER_COLORS.length];
}

/**
 * Bucketed downsampling that keeps the extreme (largest |v|) point of each
 * bucket, so chromatogram peaks and pressure spikes survive even when
 * 50k samples are drawn into ~1.5k pixels.
 */
function downsample(t: number[], v: number[], maxPoints: number): Array<{ t: number; v: number }> {
  const n = t.length;
  if (n <= maxPoints) {
    const out = new Array<{ t: number; v: number }>(n);
    for (let i = 0; i < n; i++) out[i] = { t: t[i], v: v[i] };
    return out;
  }
  const bucket = n / maxPoints;
  const out: Array<{ t: number; v: number }> = [];
  for (let b = 0; b < maxPoints; b++) {
    const start = Math.floor(b * bucket);
    const end = Math.min(n, Math.floor((b + 1) * bucket));
    let best = start;
    for (let i = start + 1; i < end; i++) if (Math.abs(v[i]) > Math.abs(v[best])) best = i;
    out.push({ t: t[best], v: v[best] });
  }
  return out;
}

function fmtMin(seconds: number): string {
  return (seconds / 60).toFixed(2);
}

export function TraceChart({
  title,
  unit,
  series,
  height = 240,
  emptyText = "Waiting for data…",
  maxPoints = 1500,
}: {
  title: string;
  unit: string;
  series: TraceSeries[];
  height?: number;
  emptyText?: string;
  maxPoints?: number;
}) {
  const drawn = useMemo(
    () =>
      series
        .filter((s) => s.t.length > 0)
        .map((s) => ({ ...s, points: downsample(s.t, s.v, maxPoints) })),
    [series, maxPoints],
  );
  const decimals = unit === "mAU" || unit === "bar" ? 1 : 2;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {drawn.length === 0 ? (
          <div
            style={{ height }}
            className="flex items-center justify-center text-sm text-muted-foreground"
          >
            {emptyText}
          </div>
        ) : (
          <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[0, "dataMax"]}
                  tickFormatter={(v) => fmtMin(Number(v))}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  label={{
                    value: "min",
                    position: "insideBottomRight",
                    offset: -4,
                    style: { fontSize: 10, fill: "var(--muted-foreground)" },
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  domain={["auto", "auto"]}
                  width={56}
                  label={{
                    value: unit,
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "var(--muted-foreground)" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => `${fmtMin(Number(v))} min`}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(decimals)} ${unit}`,
                    String(name),
                  ]}
                  isAnimationActive={false}
                />
                {drawn.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {drawn.map((s) => (
                  <Line
                    key={s.name}
                    data={s.points}
                    dataKey="v"
                    name={s.label}
                    type="linear"
                    stroke={s.color}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
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

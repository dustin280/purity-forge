import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
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
import { Input } from "@/components/ui/input";

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
 * Index range [start, end) of a time-sorted array covering [lo, hi], widened
 * by one sample on each side so the drawn line still reaches the window edges.
 */
function visibleRange(t: number[], lo: number | null, hi: number | null): [number, number] {
  let start = 0;
  let end = t.length;
  if (lo !== null) {
    let a = 0;
    let b = t.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (t[m] < lo) a = m + 1;
      else b = m;
    }
    start = Math.max(0, a - 1);
  }
  if (hi !== null) {
    let a = 0;
    let b = t.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (t[m] <= hi) a = m + 1;
      else b = m;
    }
    end = Math.min(t.length, a + 1);
  }
  return start < end ? [start, end] : [0, 0];
}

/**
 * Bucketed downsampling of samples [start, end) that keeps the extreme
 * (largest |v|) point of each bucket, so chromatogram peaks and pressure
 * spikes survive even when 50k samples are drawn into ~1.5k pixels. Only the
 * visible window is bucketed, so zooming the X axis reveals full detail.
 */
function downsample(
  t: number[],
  v: number[],
  start: number,
  end: number,
  maxPoints: number,
): Array<{ t: number; v: number }> {
  const n = end - start;
  if (n <= maxPoints) {
    const out = new Array<{ t: number; v: number }>(n);
    for (let i = 0; i < n; i++) out[i] = { t: t[start + i], v: v[start + i] };
    return out;
  }
  const bucket = n / maxPoints;
  const out: Array<{ t: number; v: number }> = [];
  for (let b = 0; b < maxPoints; b++) {
    const s = start + Math.floor(b * bucket);
    const e = Math.min(end, start + Math.floor((b + 1) * bucket));
    let best = s;
    for (let i = s + 1; i < e; i++) if (Math.abs(v[i]) > Math.abs(v[best])) best = i;
    out.push({ t: t[best], v: v[best] });
  }
  return out;
}

function fmtMin(seconds: number): string {
  return (seconds / 60).toFixed(2);
}

/* ---------------- axis scale controls ---------------- */

interface AxisInputs {
  /** minutes */
  xMin: string;
  xMax: string;
  /** chart units */
  yMin: string;
  yMax: string;
}
const AUTO_AXES: AxisInputs = { xMin: "", xMax: "", yMin: "", yMax: "" };

function parseLimit(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A pair set the wrong way round (min ≥ max) falls back to auto, so a half-typed value never blanks the chart. */
function orderedPair(min: number | null, max: number | null): [number | null, number | null] {
  return min !== null && max !== null && min >= max ? [null, null] : [min, max];
}

function AxisField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      placeholder="auto"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-[4.5rem] px-1.5 text-xs md:text-xs tabular-nums"
    />
  );
}

function AxisControls({
  inputs,
  unit,
  onChange,
}: {
  inputs: AxisInputs;
  unit: string;
  onChange: (next: AxisInputs) => void;
}) {
  const manual = Object.values(inputs).some((s) => s.trim() !== "");
  const set = (key: keyof AxisInputs) => (v: string) => onChange({ ...inputs, [key]: v });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="font-medium">X</span>
        <AxisField label="X axis from (min)" value={inputs.xMin} onChange={set("xMin")} />
        <span>–</span>
        <AxisField label="X axis to (min)" value={inputs.xMax} onChange={set("xMax")} />
        <span>min</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="font-medium">Y</span>
        <AxisField label={`Y axis from (${unit})`} value={inputs.yMin} onChange={set("yMin")} />
        <span>–</span>
        <AxisField label={`Y axis to (${unit})`} value={inputs.yMax} onChange={set("yMax")} />
        <span>{unit}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={!manual}
        onClick={() => onChange(AUTO_AXES)}
      >
        <RotateCcw className="size-3" /> Auto
      </Button>
    </div>
  );
}

/* ---------------- chart ---------------- */

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
  // Manual axis limits; empty = auto. X is entered in minutes, plotted in seconds.
  const [axes, setAxes] = useState<AxisInputs>(AUTO_AXES);
  const [xMinMin, xMaxMin] = orderedPair(parseLimit(axes.xMin), parseLimit(axes.xMax));
  const [yMin, yMax] = orderedPair(parseLimit(axes.yMin), parseLimit(axes.yMax));
  const xMin = xMinMin === null ? null : xMinMin * 60;
  const xMax = xMaxMin === null ? null : xMaxMin * 60;
  const manualX = xMin !== null || xMax !== null;
  const manualY = yMin !== null || yMax !== null;

  const drawn = useMemo(
    () =>
      series
        .filter((s) => s.t.length > 0)
        .map((s) => {
          const [start, end] = visibleRange(s.t, xMin, xMax);
          return { ...s, points: downsample(s.t, s.v, start, end, maxPoints) };
        }),
    [series, maxPoints, xMin, xMax],
  );
  const decimals = unit === "mAU" || unit === "bar" ? 1 : 2;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <AxisControls inputs={axes} unit={unit} onChange={setAxes} />
        </div>
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
                  domain={[xMin ?? 0, xMax ?? "dataMax"]}
                  allowDataOverflow={manualX}
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
                  domain={[yMin ?? "auto", yMax ?? "auto"]}
                  allowDataOverflow={manualY}
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

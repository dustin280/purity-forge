import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn } from "lucide-react";
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
import { Input } from "@/components/ui/input";

export interface TraceSeries {
  name: string;
  label: string;
  color: string;
  /** run-relative seconds (xMode "relative") or epoch seconds (xMode "wall") */
  t: number[];
  v: number[];
}

/** A run to mark on a wall-clock chart: a start line, and a minute axis that restarts here. */
export interface RunMarker {
  /** epoch seconds */
  started_at: number;
  /** epoch seconds; null while the run is still going */
  ended_at?: number | null;
  label: string;
}

function fmtRunMinute(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
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
 * visible window is bucketed, so a narrower window reveals full detail.
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

/**
 * The chromatogram's Y axis keeps its lower limit here whenever a maximum is
 * typed: "Y to 500" scales -10..500 mAU (Dustin, 2026-09-05).
 */
export const CHROMATOGRAM_Y_FLOOR_MAU = -10;

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

/** A fixed floor under a typed ceiling; a ceiling at or below the floor falls back to auto. */
function flooredPair(floor: number, max: number | null): [number | null, number | null] {
  return max !== null && max > floor ? [floor, max] : [null, null];
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
  showX,
  yFloor,
  freeZoom,
  zoomed,
  onChange,
  onFreeZoom,
  onResetZoom,
}: {
  inputs: AxisInputs;
  unit: string;
  /** the X inputs only make sense on a run-relative axis; wall-clock charts are panned by the page */
  showX: boolean;
  /** fixed lower Y limit shown in place of the "from" field */
  yFloor: number | null;
  freeZoom: boolean;
  zoomed: boolean;
  onChange: (next: AxisInputs) => void;
  onFreeZoom: (on: boolean) => void;
  onResetZoom: () => void;
}) {
  const manual =
    zoomed ||
    (showX ? Object.values(inputs) : [inputs.yMin, inputs.yMax]).some((s) => s.trim() !== "");
  const set = (key: keyof AxisInputs) => (v: string) => onChange({ ...inputs, [key]: v });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {showX && (
        <span className="flex items-center gap-1">
          <span className="font-medium">X</span>
          <AxisField label="X axis from (min)" value={inputs.xMin} onChange={set("xMin")} />
          <span>&ndash;</span>
          <AxisField label="X axis to (min)" value={inputs.xMax} onChange={set("xMax")} />
          <span>min</span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className="font-medium">Y</span>
        {yFloor != null ? (
          <span className="tabular-nums" title="fixed lower limit">
            {yFloor}
          </span>
        ) : (
          <AxisField label={`Y axis from (${unit})`} value={inputs.yMin} onChange={set("yMin")} />
        )}
        <span>&ndash;</span>
        <AxisField label={`Y axis to (${unit})`} value={inputs.yMax} onChange={set("yMax")} />
        <span>{unit}</span>
      </span>
      <Button
        type="button"
        variant={freeZoom ? "default" : "outline"}
        size="sm"
        className="h-7 px-2 text-[11px]"
        aria-pressed={freeZoom}
        title="Scroll or pinch to zoom, drag to pan"
        onClick={() => onFreeZoom(!freeZoom)}
      >
        <ZoomIn className="size-3" /> Free zoom
      </Button>
      {freeZoom && <span>scroll or pinch to zoom, drag to pan</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={!manual}
        onClick={() => {
          onChange(AUTO_AXES);
          onResetZoom();
        }}
      >
        <RotateCcw className="size-3" /> Auto
      </Button>
    </div>
  );
}

/* ---------------- free zoom: wheel, pinch, drag-pan ---------------- */

type Range = [number, number];
interface ZoomState {
  x: Range | null;
  y: Range | null;
}
const NO_ZOOM: ZoomState = { x: null, y: null };
/** one wheel notch */
const WHEEL_STEP = 1.2;
/** Plot-area insets, matching the LineChart margins and axis sizes below. */
const PLOT_LEFT = 56;
const PLOT_RIGHT = 12;
const PLOT_TOP = 8;
const X_AXIS_H = 30;
const RUN_AXIS_H = 20;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** `range` scaled by `factor` about the point at fraction `f` of it. */
function scaled(range: Range, f: number, factor: number): Range {
  const c = range[0] + f * (range[1] - range[0]);
  return [c - (c - range[0]) * factor, c + (range[1] - c) * factor];
}

/**
 * While enabled, the chart's wrapper takes wheel (zoom about the pointer),
 * two-finger pinch (zoom about the midpoint) and drag / one-finger pan, and
 * the resulting X/Y ranges override the axes until reset. `baseRef` holds
 * what the axes span right now when nothing is zoomed, so the first gesture
 * has something to scale. Native listeners: React's wheel/touch handlers are
 * passive, and the page must not scroll or pinch-zoom underneath.
 */
function useFreeZoom(
  enabled: boolean,
  baseRef: { current: ZoomState },
  bottomInset: number,
): { ref: React.RefObject<HTMLDivElement | null>; zoom: ZoomState; reset: () => void } {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(NO_ZOOM);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    if (!enabled) setZoom(NO_ZOOM);
  }, [enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const current = (): { x: Range; y: Range } | null => {
      const x = zoomRef.current.x ?? baseRef.current.x;
      const y = zoomRef.current.y ?? baseRef.current.y;
      return x && y ? { x, y } : null;
    };
    const plot = () => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left + PLOT_LEFT,
        top: r.top + PLOT_TOP,
        w: Math.max(1, r.width - PLOT_LEFT - PLOT_RIGHT),
        h: Math.max(1, r.height - PLOT_TOP - bottomInset),
      };
    };
    /** pointer -> fraction of the plot area, y from the bottom */
    const frac = (clientX: number, clientY: number) => {
      const p = plot();
      return {
        fx: clamp((clientX - p.left) / p.w, 0, 1),
        fy: clamp(1 - (clientY - p.top) / p.h, 0, 1),
      };
    };
    const apply = (x: Range, y: Range) => {
      if (x[1] - x[0] < 0.5 || y[1] - y[0] < 1e-3) return; // tight enough
      setZoom({ x, y });
    };

    const onWheel = (e: WheelEvent) => {
      const cur = current();
      if (!cur) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const { fx, fy } = frac(e.clientX, e.clientY);
      apply(scaled(cur.x, fx, factor), scaled(cur.y, fy, factor));
    };

    let drag: { x: number; y: number; start: { x: Range; y: Range } } | null = null;
    let pinch: { d: number; fx: number; fy: number; start: { x: Range; y: Range } } | null = null;
    const pan = (clientX: number, clientY: number) => {
      if (!drag) return;
      const p = plot();
      const dx = ((clientX - drag.x) / p.w) * (drag.start.x[1] - drag.start.x[0]);
      const dy = ((clientY - drag.y) / p.h) * (drag.start.y[1] - drag.start.y[0]);
      setZoom({
        x: [drag.start.x[0] - dx, drag.start.x[1] - dx],
        y: [drag.start.y[0] + dy, drag.start.y[1] + dy],
      });
    };
    const onMouseDown = (e: MouseEvent) => {
      const cur = current();
      if (!cur || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, start: cur };
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (drag) pan(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      drag = null;
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      const cur = current();
      if (!cur) return;
      if (e.touches.length === 2) {
        const { fx, fy } = frac(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
        pinch = { d: dist(e.touches), fx, fy, start: cur };
        drag = null;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, start: cur };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const factor = pinch.d / Math.max(1, dist(e.touches));
        apply(scaled(pinch.start.x, pinch.fx, factor), scaled(pinch.start.y, pinch.fy, factor));
      } else if (drag && e.touches.length === 1) {
        e.preventDefault();
        pan(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => {
      pinch = null;
      drag = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, baseRef, bottomInset]);

  return { ref, zoom, reset: () => setZoom(NO_ZOOM) };
}

/* ---------------- chart ---------------- */

export function TraceChart({
  title,
  unit,
  series,
  height = 240,
  emptyText = "Waiting for data…",
  maxPoints = 1500,
  xMode = "relative",
  xDomain = null,
  runs = [],
  yFloor = null,
}: {
  title: string;
  unit: string;
  series: TraceSeries[];
  height?: number;
  emptyText?: string;
  maxPoints?: number;
  /** "relative": run-relative seconds with X limit inputs; "wall": epoch seconds, window from `xDomain` */
  xMode?: "relative" | "wall";
  /** [start, end] in epoch seconds (wall mode) */
  xDomain?: [number, number] | null;
  /** run starts to mark (wall mode) */
  runs?: RunMarker[];
  /** fixed lower Y limit whenever a Y maximum is typed (chromatogram: CHROMATOGRAM_Y_FLOOR_MAU) */
  yFloor?: number | null;
}) {
  const wall = xMode === "wall";
  // Manual axis limits; empty = auto. X is entered in minutes, plotted in seconds.
  const [axes, setAxes] = useState<AxisInputs>(AUTO_AXES);
  const [xMinMin, xMaxMin] = orderedPair(parseLimit(axes.xMin), parseLimit(axes.xMax));
  const [yLimMin, yLimMax] =
    yFloor != null
      ? flooredPair(yFloor, parseLimit(axes.yMax))
      : orderedPair(parseLimit(axes.yMin), parseLimit(axes.yMax));
  const xLimMin = wall ? (xDomain?.[0] ?? null) : xMinMin === null ? null : xMinMin * 60;
  const xLimMax = wall ? (xDomain?.[1] ?? null) : xMaxMin === null ? null : xMaxMin * 60;

  // Free zoom (wheel / pinch / drag) overrides both axes until Auto or the
  // toggle clears it; a live window keeps moving underneath, unseen.
  const [freeZoom, setFreeZoom] = useState(false);
  const baseRef = useRef<ZoomState>(NO_ZOOM);
  const fz = useFreeZoom(freeZoom, baseRef, X_AXIS_H + (wall ? RUN_AXIS_H : 0));
  const xMin = fz.zoom.x?.[0] ?? xLimMin;
  const xMax = fz.zoom.x?.[1] ?? xLimMax;
  const yMin = fz.zoom.y?.[0] ?? yLimMin;
  const yMax = fz.zoom.y?.[1] ?? yLimMax;
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
  // What the axes span right now, for the first zoom gesture: the limits in
  // force, else the extent of the visible data (close to recharts' auto).
  const extent = useMemo(() => {
    let t0 = Infinity;
    let t1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const s of drawn)
      for (const p of s.points) {
        if (p.t < t0) t0 = p.t;
        if (p.t > t1) t1 = p.t;
        if (p.v < v0) v0 = p.v;
        if (p.v > v1) v1 = p.v;
      }
    return t0 <= t1 ? { t0, t1, v0, v1 } : null;
  }, [drawn]);
  useEffect(() => {
    const xBase: Range | null =
      xMin !== null && xMax !== null
        ? [xMin, xMax]
        : extent
          ? [xMin ?? (wall ? extent.t0 : 0), xMax ?? extent.t1]
          : null;
    const yBase: Range | null =
      yMin !== null && yMax !== null
        ? [yMin, yMax]
        : extent
          ? [yMin ?? extent.v0, yMax ?? extent.v1]
          : null;
    baseRef.current = { x: xBase, y: yBase };
  }, [xMin, xMax, yMin, yMax, extent, wall]);
  const decimals = unit === "mAU" || unit === "bar" ? 1 : 2;

  const span = xMin !== null && xMax !== null ? xMax - xMin : 0;
  const fmtX = (v: number): string =>
    wall ? format(v * 1000, span > 1800 ? "HH:mm" : "HH:mm:ss") : fmtMin(v);
  const tooltipLabel = (v: number): string => {
    if (!wall) return `${fmtMin(v)} min`;
    const base = format(v * 1000, "HH:mm:ss");
    let run: RunMarker | null = null;
    for (const r of runs) if (r.started_at <= v && (!run || r.started_at > run.started_at)) run = r;
    return run ? `${base} · ${fmtMin(v - run.started_at)} min into ${run.label}` : base;
  };
  const markers =
    wall && xMin !== null && xMax !== null
      ? runs.filter((r) => r.started_at >= xMin && r.started_at <= xMax)
      : [];

  // Second bottom axis: minutes into the injection, restarting at each run
  // start and stopping where the run ends, so a peak's retention time can be
  // read straight off the chart.
  const runTicks = useMemo(() => {
    if (!wall || xMin === null || xMax === null || runs.length === 0) return [];
    const stepMin = span <= 6 * 60 ? 0.5 : span <= 16 * 60 ? 1 : span <= 31 * 60 ? 2 : 5;
    const step = stepMin * 60;
    const sorted = [...runs].sort((a, b) => a.started_at - b.started_at);
    const out: number[] = [];
    sorted.forEach((r, i) => {
      const end = Math.min(xMax, r.ended_at ?? sorted[i + 1]?.started_at ?? xMax);
      for (let t = r.started_at; t <= end + 1e-6; t += step) if (t >= xMin) out.push(t);
    });
    return out;
  }, [wall, xMin, xMax, span, runs]);
  const fmtRunTick = (v: number): string => {
    let run: RunMarker | null = null;
    for (const r of runs)
      if (r.started_at <= v + 1e-6 && (!run || r.started_at > run.started_at)) run = r;
    return run ? fmtRunMinute(Math.round(((v - run.started_at) / 60) * 10) / 10) : "";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <AxisControls
            inputs={axes}
            unit={unit}
            showX={!wall}
            yFloor={yFloor}
            freeZoom={freeZoom}
            zoomed={fz.zoom.x !== null || fz.zoom.y !== null}
            onChange={setAxes}
            onFreeZoom={setFreeZoom}
            onResetZoom={fz.reset}
          />
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
          <div
            ref={fz.ref}
            style={{
              height,
              touchAction: freeZoom ? "none" : undefined,
              cursor: freeZoom ? "grab" : undefined,
            }}
            className={"w-full" + (freeZoom ? " select-none" : "")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={
                    wall ? [xMin ?? "dataMin", xMax ?? "dataMax"] : [xMin ?? 0, xMax ?? "dataMax"]
                  }
                  allowDataOverflow={manualX}
                  tickFormatter={(v) => fmtX(Number(v))}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  label={
                    wall
                      ? undefined
                      : {
                          value: "min",
                          position: "insideBottomRight",
                          offset: -4,
                          style: { fontSize: 10, fill: "var(--muted-foreground)" },
                        }
                  }
                />
                {wall && (
                  <XAxis
                    xAxisId="run"
                    dataKey="t"
                    type="number"
                    domain={[xMin ?? "dataMin", xMax ?? "dataMax"]}
                    allowDataOverflow={manualX}
                    ticks={runTicks}
                    interval={0}
                    tickFormatter={(v) => fmtRunTick(Number(v))}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    height={20}
                    stroke="var(--muted-foreground)"
                    label={{
                      value: "min into injection",
                      position: "insideBottomRight",
                      offset: -2,
                      style: { fontSize: 10, fill: "var(--muted-foreground)" },
                    }}
                  />
                )}
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  domain={[yMin ?? "auto", yMax ?? "auto"]}
                  // zoomed domains produce unrounded ticks (88.666…)
                  tickFormatter={(v) => String(Number(Number(v).toFixed(decimals)))}
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
                  labelFormatter={(v) => tooltipLabel(Number(v))}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(decimals)} ${unit}`,
                    String(name),
                  ]}
                  isAnimationActive={false}
                />
                {drawn.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {markers.map((r) => (
                  <ReferenceLine
                    key={`${r.started_at}`}
                    x={r.started_at}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                    label={{
                      value: r.label,
                      position: "insideTopLeft",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                ))}
                {wall && (
                  // Binds the run-minute axis to the chart so it keeps the shared domain.
                  <Line
                    xAxisId="run"
                    data={[]}
                    dataKey="v"
                    stroke="none"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                  />
                )}
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

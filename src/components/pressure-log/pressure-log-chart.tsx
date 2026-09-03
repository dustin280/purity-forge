import { useMemo } from "react";
import { format } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InstrumentPressureLogRow } from "@/lib/instrument-feed.functions";

const SERIES_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.15 173)",
  "oklch(0.72 0.17 50)",
  "oklch(0.6 0.2 290)",
  "oklch(0.62 0.22 12)",
];

export interface PressurePoint {
  t: number;
  /** mean over the entries folded into this point */
  pressure: number;
  /** widest [min, max] over those entries */
  band: [number, number] | null;
  flow: number | null;
  temp: number | null;
  state: string;
  /** log entries folded into this point (1 unless downsampled) */
  entries: number;
}

/**
 * Fold time-ordered log entries into at most `maxPoints` points: mean
 * pressure, the widest min–max band, mean flow and temperature. Averaging
 * (rather than picking one entry) keeps the printed chart honest about what a
 * point stands for; the band still shows the excursions.
 */
export function bucketRows(rows: InstrumentPressureLogRow[], maxPoints: number): PressurePoint[] {
  const n = rows.length;
  const per = Math.max(1, Math.ceil(n / maxPoints));
  const out: PressurePoint[] = [];
  for (let i = 0; i < n; i += per) {
    const slice = rows.slice(i, i + per);
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let flowSum = 0;
    let flowN = 0;
    let tempSum = 0;
    let tempN = 0;
    for (const r of slice) {
      sum += r.pressure_bar;
      lo = Math.min(lo, r.pressure_min_bar ?? r.pressure_bar);
      hi = Math.max(hi, r.pressure_max_bar ?? r.pressure_bar);
      if (r.flow_ml_min != null) {
        flowSum += r.flow_ml_min;
        flowN++;
      }
      if (r.column_temp_c != null) {
        tempSum += r.column_temp_c;
        tempN++;
      }
    }
    out.push({
      t: new Date(slice[0].logged_at).getTime(),
      pressure: sum / slice.length,
      band: [lo, hi],
      flow: flowN ? flowSum / flowN : null,
      temp: tempN ? tempSum / tempN : null,
      state: slice[slice.length - 1].state,
      entries: slice.length,
    });
  }
  return out;
}

function PressureTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PressurePoint; name?: string; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const first = payload[0].payload;
  if (!first) return null;
  // One instrument: every series shares the same point. Several: one point each.
  const multi = new Set(payload.map((e) => e.payload)).size > 1;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-0.5">
      <div className="font-medium">
        {format(first.t, "MMM d, yyyy HH:mm")}
        {first.entries > 1 ? (
          <span className="text-muted-foreground"> · {first.entries} entries</span>
        ) : null}
      </div>
      {multi ? (
        payload.map((e) =>
          e.payload ? (
            <div key={e.name} style={{ color: e.color }}>
              {e.name}: <span className="font-mono">{e.payload.pressure.toFixed(1)} bar</span>
            </div>
          ) : null,
        )
      ) : (
        <>
          <div>
            Pressure: <span className="font-mono">{first.pressure.toFixed(1)} bar</span>
            {first.band && (
              <span className="text-muted-foreground">
                {" "}
                ({first.band[0].toFixed(1)} – {first.band[1].toFixed(1)})
              </span>
            )}
          </div>
          {first.flow != null && (
            <div>
              Flow: <span className="font-mono">{first.flow.toFixed(3)} mL/min</span>
            </div>
          )}
          {first.temp != null && (
            <div>
              Column: <span className="font-mono">{first.temp.toFixed(1)} °C</span>
            </div>
          )}
          <div className="text-muted-foreground capitalize">{first.state}</div>
        </>
      )}
    </div>
  );
}

export function PressureLogChart({
  rows,
  instrumentNames,
  height = 280,
  maxPoints = 1500,
}: {
  /** any order; grouped and sorted here */
  rows: InstrumentPressureLogRow[];
  instrumentNames: Map<string, string>;
  height?: number;
  maxPoints?: number;
}) {
  const groups = useMemo(() => {
    const byInstrument = new Map<string, InstrumentPressureLogRow[]>();
    for (const r of rows) {
      const list = byInstrument.get(r.instrument_id);
      if (list) list.push(r);
      else byInstrument.set(r.instrument_id, [r]);
    }
    return [...byInstrument.entries()].map(([id, list]) => ({
      id,
      name: instrumentNames.get(id) ?? "Instrument",
      points: bucketRows(
        [...list].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()),
        maxPoints,
      ),
    }));
  }, [rows, instrumentNames, maxPoints]);

  const spanMs = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const g of groups)
      for (const p of g.points) {
        lo = Math.min(lo, p.t);
        hi = Math.max(hi, p.t);
      }
    return hi - lo;
  }, [groups]);
  const tickFmt = spanMs <= 2 * 86_400_000 ? "MMM d HH:mm" : "MMM d";

  const single = groups.length === 1;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => format(Number(v), tickFmt)}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            yAxisId="bar"
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
          {single && (
            <YAxis
              yAxisId="flow"
              orientation="right"
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              domain={[0, "auto"]}
              width={52}
              label={{
                value: "mL/min",
                angle: 90,
                position: "insideRight",
                style: { fontSize: 11, fill: "var(--muted-foreground)" },
              }}
            />
          )}
          <Tooltip content={<PressureTooltip />} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {single && (
            <Area
              yAxisId="bar"
              data={groups[0].points}
              dataKey="band"
              name="min – max"
              type="monotone"
              stroke="none"
              fill={SERIES_COLORS[0]}
              fillOpacity={0.15}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {groups.map((g, i) => (
            <Line
              key={g.id}
              yAxisId="bar"
              data={g.points}
              dataKey="pressure"
              name={single ? "Pressure" : g.name}
              type="monotone"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
          {single && (
            <Line
              yAxisId="flow"
              data={groups[0].points}
              dataKey="flow"
              name="Flow"
              type="stepAfter"
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 2 }}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getInstrumentRunTrace } from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";
import {
  StreamPicker,
  DEFAULT_STREAMS,
  isDadSignal,
  streamDisplayName,
} from "@/components/live-instruments/stream-picker";
import {
  TraceChart,
  colorForStream,
  type TraceSeries,
} from "@/components/live-instruments/trace-chart";

export const Route = createFileRoute("/_authenticated/lab-logs/live-instruments/$runId")({
  component: RunReplayPage,
});

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function RunReplayPage() {
  const { runId } = Route.useParams();
  const fn = useServerFn(getInstrumentRunTrace);
  const { data, isLoading, error } = useQuery({
    queryKey: qk.instrumentFeed.trace(runId),
    queryFn: () => fn({ data: { run_id: runId } }),
  });
  const [selectedStreams, setSelectedStreams] = useState<string[]>(DEFAULT_STREAMS);

  const wavelengths = data?.trace?.wavelengths_nm ?? data?.run.summary?.wavelengths_nm ?? {};
  const labelFor = (name: string): string | null => {
    const m = /^DAD1([A-H])$/.exec(name);
    const wl = m ? wavelengths[m[1]] : undefined;
    return wl !== undefined ? `${wl} nm` : null;
  };

  const options = useMemo(
    () =>
      Object.entries(data?.trace?.streams ?? {})
        .map(([name, s]) => ({ name, units: s.units, label: labelFor(name) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  const { dadSeries, scalarCharts } = useMemo(() => {
    const dad: TraceSeries[] = [];
    const scalars: Array<{ name: string; unit: string; series: TraceSeries[] }> = [];
    const streams = data?.trace?.streams ?? {};
    let i = 0;
    for (const name of selectedStreams) {
      const s = streams[name];
      if (!s) continue;
      const t = s.values.map((_, k) => s.t0 + k * s.dt);
      const series: TraceSeries = {
        name,
        label: streamDisplayName(name, labelFor(name)),
        color: colorForStream(name, i++),
        t,
        v: s.values,
      };
      if (isDadSignal(name)) dad.push(series);
      else scalars.push({ name, unit: s.units, series: [series] });
    }
    return { dadSeries: dad, scalarCharts: scalars };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedStreams]);

  const run = data?.run;
  const summary = run?.summary;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      <Link to="/lab-logs/live-instruments">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Live Instruments
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Instruments · Replay
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          {run
            ? `Injection #${run.injection_index} · ${fmtDateTime(run.started_at)}`
            : "Run replay"}
        </h1>
        {summary?.method && <p className="text-sm text-muted-foreground mt-1">{summary.method}</p>}
      </div>

      {isLoading && <Skeleton className="h-[300px] w-full" />}
      {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
      {data && !data.trace && (
        <div className="text-sm text-muted-foreground">No stored trace for this run.</div>
      )}

      {data?.trace && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Ended: </span>
                  {fmtDateTime(run?.ended_at ?? null)}
                </div>
                <div>
                  <span className="text-muted-foreground">Start pressure: </span>
                  {summary?.initiation?.pressure_bar?.toFixed(1) ?? "—"} bar
                </div>
                <div>
                  <span className="text-muted-foreground">Min / max: </span>
                  {summary?.pressure_min_bar?.toFixed(1) ?? "—"} /{" "}
                  {summary?.pressure_max_bar?.toFixed(1) ?? "—"} bar
                </div>
                <div>
                  <span className="text-muted-foreground">Flow: </span>
                  {summary?.initiation?.flow_ml_min?.toFixed(3) ?? "—"} mL/min
                </div>
                <div>
                  <span className="text-muted-foreground">Column temp: </span>
                  {summary?.initiation?.column_temp_c?.toFixed(1) ?? "—"} °C
                </div>
              </div>
              <StreamPicker
                options={options}
                selected={selectedStreams}
                onChange={setSelectedStreams}
              />
            </CardContent>
          </Card>
          {selectedStreams.some(isDadSignal) && (
            <TraceChart
              title="Chromatogram"
              unit="mAU"
              series={dadSeries}
              height={320}
              emptyText="Select a detector signal."
              maxPoints={3300}
            />
          )}
          {scalarCharts.map((c) => (
            <TraceChart
              key={c.name}
              title={streamDisplayName(c.name, labelFor(c.name))}
              unit={c.unit}
              series={c.series}
              height={200}
            />
          ))}
        </div>
      )}
    </div>
  );
}

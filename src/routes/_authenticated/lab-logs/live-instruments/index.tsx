import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listInstrumentLiveOverview, listInstrumentRuns } from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";
import { useInstrumentLiveFeed } from "@/components/live-instruments/use-instrument-live-feed";
import {
  InstrumentStatusList,
  liveStateOf,
} from "@/components/live-instruments/instrument-status-list";
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
import { RecentRunsTable } from "@/components/live-instruments/recent-runs-table";

export const Route = createFileRoute("/_authenticated/lab-logs/live-instruments/")({
  component: LiveInstrumentsPage,
});

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LiveInstrumentsPage() {
  const overviewFn = useServerFn(listInstrumentLiveOverview);
  const { data: overview = [], isLoading } = useQuery({
    queryKey: qk.instrumentFeed.overview(),
    queryFn: () => overviewFn(),
    refetchInterval: 15_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = useMemo(() => {
    if (selectedId && overview.some((o) => o.instrument.id === selectedId)) return selectedId;
    const running = overview.find((o) => liveStateOf(o) === "running");
    return running?.instrument.id ?? overview[0]?.instrument.id ?? null;
  }, [selectedId, overview]);

  const feed = useInstrumentLiveFeed(effectiveId);
  const [selectedStreams, setSelectedStreams] = useState<string[]>(DEFAULT_STREAMS);

  const runsFn = useServerFn(listInstrumentRuns);
  const runsQuery = useQuery({
    queryKey: qk.instrumentFeed.runs(effectiveId),
    queryFn: () => runsFn({ data: { instrument_id: effectiveId, limit: 25 } }),
    enabled: !!effectiveId,
    refetchInterval: 30_000,
  });

  const selectedOverview = overview.find((o) => o.instrument.id === effectiveId) ?? null;

  // Streams available = what the agent has reported (live buffers first, then the persisted list).
  const streamOptions = useMemo(() => {
    const seen = new Map<string, { name: string; units: string; label: string | null }>();
    for (const [name, buf] of Object.entries(feed.streams))
      seen.set(name, { name, units: buf.units, label: buf.label });
    for (const s of selectedOverview?.status?.streams ?? []) {
      if (!seen.has(s.name))
        seen.set(s.name, {
          name: s.name,
          units: s.units,
          label: (s as { label?: string | null }).label ?? null,
        });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [feed.streams, selectedOverview]);

  // Rebuilt on every batch (batchSeq) — buffers mutate in place.
  const { dadSeries, scalarCharts } = useMemo(() => {
    const dad: TraceSeries[] = [];
    const scalars: Array<{ name: string; unit: string; series: TraceSeries[] }> = [];
    let i = 0;
    for (const name of selectedStreams) {
      const buf = feed.streams[name];
      if (!buf) continue;
      const series: TraceSeries = {
        name,
        label: streamDisplayName(name, buf.label),
        color: colorForStream(name, i++),
        t: buf.t,
        v: buf.v,
      };
      if (isDadSignal(name)) dad.push(series);
      else scalars.push({ name, unit: buf.units, series: [series] });
    }
    return { dadSeries: dad, scalarCharts: scalars };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.batchSeq, feed.streams, selectedStreams]);

  const state = selectedOverview ? liveStateOf(selectedOverview) : "offline";
  const anyDadSelected = selectedStreams.some(isDadSignal);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Instruments · Live
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Live Instrument Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chromatogram, pump pressure and module traces straight from the instrument LAN, as they
            are acquired.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {feed.connected ? (
            <Wifi className="size-4 text-[var(--status-success,oklch(0.65_0.15_150))]" />
          ) : (
            <WifiOff className="size-4" />
          )}
          {feed.connected ? "Realtime connected" : "Connecting…"}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Instruments
          </div>
          <InstrumentStatusList
            items={overview}
            selectedId={effectiveId}
            onSelect={setSelectedId}
            isLoading={isLoading}
          />
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Instrument: </span>
                  <span className="font-medium">{selectedOverview?.instrument.name ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">State: </span>
                  <span className="capitalize">{state}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Run: </span>
                  {feed.run && state === "running"
                    ? `injection #${feed.run.injection_index} · started ${fmtDateTime(feed.run.started_at)}`
                    : "idle monitor"}
                </div>
                {feed.sequence && (
                  <div>
                    <span className="text-muted-foreground">Sequence since: </span>
                    {fmtDateTime(feed.sequence.started_at)}
                  </div>
                )}
              </div>
              <StreamPicker
                options={streamOptions}
                selected={selectedStreams}
                onChange={setSelectedStreams}
              />
            </CardContent>
          </Card>

          {anyDadSelected && (
            <TraceChart
              title="Chromatogram"
              unit="mAU"
              series={dadSeries}
              height={300}
              emptyText={
                state === "offline"
                  ? "Instrument offline — no agent data."
                  : "Waiting for detector data…"
              }
            />
          )}
          {scalarCharts.map((c) => (
            <TraceChart
              key={c.name}
              title={streamDisplayName(c.name, feed.streams[c.name]?.label)}
              unit={c.unit}
              series={c.series}
              height={200}
              emptyText={
                state === "offline" ? "Instrument offline — no agent data." : "Waiting for data…"
              }
            />
          ))}

          <RecentRunsTable
            runs={runsQuery.data?.runs ?? []}
            sequences={runsQuery.data?.sequences ?? []}
            isLoading={runsQuery.isLoading}
          />
        </div>
      </div>
    </div>
  );
}

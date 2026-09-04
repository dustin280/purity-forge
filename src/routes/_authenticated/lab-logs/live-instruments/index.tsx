import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Radio, Wifi, WifiOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listInstrumentLiveOverview, listInstrumentRuns } from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";
import {
  LIVE_HISTORY_MINUTES,
  useInstrumentLiveFeed,
} from "@/components/live-instruments/use-instrument-live-feed";
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
  type RunMarker,
  type TraceSeries,
} from "@/components/live-instruments/trace-chart";
import { RecentRunsTable } from "@/components/live-instruments/recent-runs-table";

export const Route = createFileRoute("/_authenticated/lab-logs/live-instruments/")({
  component: LiveInstrumentsPage,
});

/** Viewable window lengths in minutes; the cache holds LIVE_HISTORY_MINUTES. */
const WINDOW_OPTIONS = [5, 15, 30, 60].filter((m) => m <= LIVE_HISTORY_MINUTES);
const DEFAULT_WINDOW_MIN = 15;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtClock(epochSeconds: number): string {
  return format(epochSeconds * 1000, "HH:mm:ss");
}

interface RunHeader {
  sample_name: string | null;
  sample_type: string | null;
  method_name: string | null;
}

/** The three things worth a headline above the chromatogram, or null if none are known. */
function runHeader(
  src:
    | { sample_name?: string | null; sample_type?: string | null; method_name?: string | null }
    | null
    | undefined,
): RunHeader | null {
  if (!src) return null;
  const h = {
    sample_name: src.sample_name ?? null,
    sample_type: src.sample_type ?? null,
    method_name: src.method_name ?? null,
  };
  return h.sample_name || h.method_name ? h : null;
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

  const [selectedStreams, setSelectedStreams] = useState<string[]>(DEFAULT_STREAMS);
  const feed = useInstrumentLiveFeed(effectiveId, selectedStreams);

  // Shared viewing window: length + where its right edge sits. While
  // "following" the edge rides on the newest sample; dragging the slider
  // parks it, "Live" snaps back.
  const [windowMin, setWindowMin] = useState(DEFAULT_WINDOW_MIN);
  const [follow, setFollow] = useState(true);
  const [viewEnd, setViewEnd] = useState<number | null>(null);

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
  const { dadSeries, scalarCharts, extent } = useMemo(() => {
    const dad: TraceSeries[] = [];
    const scalars: Array<{ name: string; unit: string; series: TraceSeries[] }> = [];
    let lo = Infinity;
    let hi = -Infinity;
    let i = 0;
    for (const name of selectedStreams) {
      const buf = feed.streams[name];
      if (!buf) continue;
      if (buf.x.length > 0) {
        lo = Math.min(lo, buf.x[0]);
        hi = Math.max(hi, buf.x[buf.x.length - 1]);
      }
      const series: TraceSeries = {
        name,
        label: streamDisplayName(name, buf.label),
        color: colorForStream(name, i++),
        t: buf.x,
        v: buf.v,
      };
      if (isDadSignal(name)) dad.push(series);
      else scalars.push({ name, unit: buf.units, series: [series] });
    }
    return { dadSeries: dad, scalarCharts: scalars, extent: lo < hi ? { lo, hi } : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.batchSeq, feed.historyLoading, feed.streams, selectedStreams]);

  const windowS = windowMin * 60;
  const domain = useMemo<[number, number] | null>(() => {
    if (!extent) return null;
    const end =
      follow || viewEnd === null ? extent.hi : Math.min(Math.max(viewEnd, extent.lo), extent.hi);
    return [end - windowS, end];
  }, [extent, follow, viewEnd, windowS]);

  const runMarkers = useMemo<RunMarker[]>(
    () =>
      feed.runs.map((r) => ({
        started_at: r.started_at,
        ended_at: r.ended_at,
        label: `injection #${r.injection_index}`,
      })),
    [feed.runs],
  );

  const state = selectedOverview ? liveStateOf(selectedOverview) : "offline";
  const anyDadSelected = selectedStreams.some(isDadSignal);

  // Sample / type / method for the current injection while running (from the
  // batches, or the stored run when the page opened mid-run), else the last run's.
  const running = state === "running" && !!feed.run;
  const header = running
    ? (runHeader(feed.runInfo) ?? runHeader(selectedOverview?.current_run))
    : runHeader(runsQuery.data?.runs[0]);
  const emptyText =
    state === "offline"
      ? "Instrument offline — no agent data."
      : feed.historyLoading
        ? "Loading the last hour…"
        : "Waiting for data…";

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
            are acquired, with the last {LIVE_HISTORY_MINUTES} minutes kept for review.
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
                {selectedOverview?.status?.column_info?.description && (
                  <div>
                    <span className="text-muted-foreground">Column: </span>
                    {selectedOverview.status.column_info.description}
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

          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Window</span>
                  <Select value={String(windowMin)} onValueChange={(v) => setWindowMin(Number(v))}>
                    <SelectTrigger className="w-[100px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WINDOW_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[200px] px-1">
                  {extent && domain ? (
                    <Slider
                      min={extent.lo}
                      max={extent.hi}
                      step={1}
                      value={[domain[1]]}
                      onValueChange={([v]) => {
                        setViewEnd(v);
                        setFollow(v >= extent.hi - 1);
                      }}
                      aria-label="Window position"
                    />
                  ) : (
                    <div className="h-1.5 rounded-full bg-primary/10" />
                  )}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground min-w-[9.5rem] text-right">
                  {domain ? `${fmtClock(domain[0])} – ${fmtClock(domain[1])}` : "—"}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={follow ? "default" : "outline"}
                  className="h-8"
                  onClick={() => {
                    setFollow(true);
                    setViewEnd(null);
                  }}
                >
                  <Radio className="size-3.5" /> Live
                </Button>
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                {extent
                  ? `Data available ${fmtClock(extent.lo)} – ${fmtClock(extent.hi)}`
                  : "No data yet"}
                {feed.historyLoading ? " · loading history…" : ""}
                {feed.historyError ? ` · history unavailable: ${feed.historyError}` : ""}
              </div>
            </CardContent>
          </Card>

          {header && (
            <div className="px-1 text-base font-semibold leading-snug">
              {!running && (
                <span className="mr-2 text-sm font-normal text-muted-foreground">Last run:</span>
              )}
              {[header.sample_name, header.sample_type, header.method_name]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {anyDadSelected && (
            <TraceChart
              title="Chromatogram"
              unit="mAU"
              series={dadSeries}
              height={320}
              emptyText={emptyText}
              xMode="wall"
              xDomain={domain}
              runs={runMarkers}
            />
          )}
          {scalarCharts.map((c) => (
            <TraceChart
              key={c.name}
              title={streamDisplayName(c.name, feed.streams[c.name]?.label)}
              unit={c.unit}
              series={c.series}
              height={220}
              emptyText={emptyText}
              xMode="wall"
              xDomain={domain}
              runs={runMarkers}
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

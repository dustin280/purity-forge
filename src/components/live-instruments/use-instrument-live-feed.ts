import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getInstrumentLiveHistory } from "@/lib/instrument-feed.functions";

/**
 * Live stream buffers for one instrument on a wall-clock axis (epoch seconds):
 * the last LIVE_HISTORY_MINUTES from the server's rolling cache
 * (instrument_live_batches, loaded per stream on demand) followed by the
 * Realtime batches that /api/instrument/feed fans out on `instrument:<id>`
 * (see src/lib/instrument-feed.server.ts). Buffers are no longer reset at run
 * boundaries — the page pans a window across them — so run starts are kept
 * separately for markers.
 */

export const LIVE_HISTORY_MINUTES = 60;

export interface FeedStatus {
  state: "idle" | "running";
  run_state?: number | null;
  analysis_state?: number | null;
  ready_state?: number | null;
  error_state?: number | null;
  not_ready_text?: string | null;
}
export interface FeedRunRef {
  key: string;
  injection_index: number;
  started_at: string;
  sample_position?: string | null;
}
export interface FeedSequenceRef {
  key: string;
  started_at: string;
}
export interface FeedStreamChunk {
  units: string;
  t0: number;
  dt: number;
  /** epoch seconds of values[0] (agent >= 1.2.1) */
  w0?: number;
  values: number[];
}
export interface FeedBatchPayload {
  sent_at: string;
  batch_seq: number;
  status: FeedStatus;
  sequence: FeedSequenceRef | null;
  run: FeedRunRef | null;
  streams: Record<string, FeedStreamChunk>;
  labels?: Record<string, string> | null;
  column?: { description?: string | null; part_number?: string | null } | null;
}
export interface FeedLifecyclePayload {
  type: "sequence_started" | "run_started" | "run_completed" | "sequence_completed";
  run?: FeedRunRef;
  run_id?: string;
  sequence?: FeedSequenceRef | null;
  sequence_id?: string | null;
  trace_available?: boolean;
}

export interface StreamBuffer {
  units: string;
  dt: number;
  label: string | null;
  /** epoch seconds, ascending */
  x: number[];
  v: number[];
}

export interface LiveRun {
  key: string;
  injection_index: number;
  /** epoch seconds */
  started_at: number;
  ended_at: number | null;
}

export interface LiveFeedState {
  connected: boolean;
  lastBatchAt: number | null;
  batchSeq: number;
  status: FeedStatus | null;
  run: FeedRunRef | null;
  sequence: FeedSequenceRef | null;
  streams: Record<string, StreamBuffer>;
  labels: Record<string, string>;
  lastLifecycle: FeedLifecyclePayload | null;
  runs: LiveRun[];
  historyLoading: boolean;
  historyError: string | null;
}

// Pressure arrives at 40 Hz: an hour is 144k points. Comfortably above that.
const MAX_POINTS_PER_STREAM = 300_000;

const EMPTY: LiveFeedState = {
  connected: false,
  lastBatchAt: null,
  batchSeq: -1,
  status: null,
  run: null,
  sequence: null,
  streams: {},
  labels: {},
  lastLifecycle: null,
  runs: [],
  historyLoading: false,
  historyError: null,
};

function epoch(iso: string): number {
  return new Date(iso).getTime() / 1000;
}

function trimBuffer(buf: StreamBuffer, horizon: number): void {
  let n = 0;
  while (n < buf.x.length && buf.x[n] < horizon) n++;
  const overflow = Math.max(n, buf.x.length - MAX_POINTS_PER_STREAM);
  if (overflow > 0) {
    buf.x.splice(0, overflow);
    buf.v.splice(0, overflow);
  }
}

/** Track run starts/ends from whatever run a batch says is current. */
function noteRun(map: Map<string, LiveRun>, run: FeedRunRef | null | undefined, seenAt: number) {
  if (run) {
    const r = map.get(run.key);
    if (r) r.ended_at = null;
    else
      map.set(run.key, {
        key: run.key,
        injection_index: run.injection_index,
        started_at: epoch(run.started_at),
        ended_at: null,
      });
  }
  for (const r of map.values()) if (r.ended_at === null && r.key !== run?.key) r.ended_at = seenAt;
}

export function useInstrumentLiveFeed(
  instrumentId: string | null,
  wantedStreams: string[],
): LiveFeedState {
  const [state, setState] = useState<LiveFeedState>(EMPTY);
  const buffers = useRef<Record<string, StreamBuffer>>({});
  const labels = useRef<Record<string, string>>({});
  const runs = useRef<Map<string, LiveRun>>(new Map());
  /** streams whose history is loaded or in flight */
  const historyDone = useRef<Set<string>>(new Set());
  const generation = useRef(0);
  const historyFn = useServerFn(getInstrumentLiveHistory);

  const commit = useCallback((extra: Partial<LiveFeedState> = {}) => {
    setState((prev) => ({
      ...prev,
      ...extra,
      streams: { ...buffers.current },
      labels: { ...labels.current },
      runs: [...runs.current.values()].sort((a, b) => a.started_at - b.started_at),
    }));
  }, []);

  // Realtime subscription: append every batch on the wall-clock axis.
  useEffect(() => {
    generation.current += 1;
    buffers.current = {};
    labels.current = {};
    runs.current = new Map();
    historyDone.current = new Set();
    setState(EMPTY);
    if (!instrumentId) return;

    const channel = supabase.channel(`instrument:${instrumentId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "batch" }, ({ payload }) => {
      const b = payload as FeedBatchPayload;
      const sentAt = epoch(b.sent_at);
      if (b.labels) labels.current = { ...labels.current, ...b.labels };
      let latest = -Infinity;
      for (const [name, chunk] of Object.entries(b.streams ?? {})) {
        const n = chunk.values.length;
        if (n === 0) continue;
        let buf = buffers.current[name];
        if (!buf) {
          buf = {
            units: chunk.units,
            dt: chunk.dt,
            label: labels.current[name] ?? null,
            x: [],
            v: [],
          };
          buffers.current[name] = buf;
        }
        buf.label = labels.current[name] ?? buf.label;
        // Older agents have no w0: place the chunk so its last sample is "now".
        const w0 = chunk.w0 ?? sentAt - (n - 1) * chunk.dt;
        const lastX = buf.x.length ? buf.x[buf.x.length - 1] : -Infinity;
        for (let i = 0; i < n; i++) {
          const x = w0 + i * chunk.dt;
          if (x <= lastX) continue; // overlap with history / a retried batch
          buf.x.push(x);
          buf.v.push(chunk.values[i]);
        }
        latest = Math.max(latest, w0 + (n - 1) * chunk.dt);
      }
      if (latest > -Infinity) {
        const horizon = latest - LIVE_HISTORY_MINUTES * 60 - 120;
        for (const buf of Object.values(buffers.current)) trimBuffer(buf, horizon);
      }
      noteRun(runs.current, b.run, sentAt);
      commit({
        lastBatchAt: Date.now(),
        batchSeq: b.batch_seq,
        status: b.status,
        run: b.run ?? null,
        sequence: b.sequence ?? null,
      });
    });

    channel.on("broadcast", { event: "lifecycle" }, ({ payload }) => {
      const p = payload as FeedLifecyclePayload;
      if (p.type === "run_started" && p.run) noteRun(runs.current, p.run, epoch(p.run.started_at));
      if (p.type === "run_completed" && p.run) {
        const r = runs.current.get(p.run.key);
        if (r && r.ended_at === null) r.ended_at = Date.now() / 1000;
      }
      commit({ lastLifecycle: p });
    });

    channel.subscribe((status) => {
      setState((prev) => ({ ...prev, connected: status === "SUBSCRIBED" }));
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instrumentId, commit]);

  // History: fetch the cached hour for streams we have not loaded yet and
  // prepend it to whatever has arrived live meanwhile.
  const wantedKey = wantedStreams.join(",");
  useEffect(() => {
    if (!instrumentId) return;
    const names = wantedKey.split(",").filter((n) => n && !historyDone.current.has(n));
    if (names.length === 0) return;
    for (const n of names) historyDone.current.add(n);
    const gen = generation.current;
    setState((prev) => ({ ...prev, historyLoading: true, historyError: null }));
    historyFn({
      data: { instrument_id: instrumentId, minutes: LIVE_HISTORY_MINUTES, streams: names },
    })
      .then((h) => {
        if (gen !== generation.current) return;
        labels.current = { ...h.labels, ...labels.current };
        for (const [name, hs] of Object.entries(h.streams)) {
          const hx: number[] = [];
          const hv: number[] = [];
          for (const seg of hs.segments)
            for (let i = 0; i < seg.values.length; i++) {
              hx.push(seg.w0 + i * seg.dt);
              hv.push(seg.values[i]);
            }
          const live = buffers.current[name];
          if (!live) {
            buffers.current[name] = {
              units: hs.units,
              dt: hs.segments[0]?.dt ?? 1,
              label: labels.current[name] ?? null,
              x: hx,
              v: hv,
            };
            continue;
          }
          const firstLive = live.x.length ? live.x[0] : Infinity;
          let cut = 0;
          while (cut < hx.length && hx[cut] < firstLive) cut++;
          live.x = hx.slice(0, cut).concat(live.x);
          live.v = hv.slice(0, cut).concat(live.v);
        }
        for (const r of h.runs) {
          if (runs.current.has(r.key)) continue;
          runs.current.set(r.key, {
            key: r.key,
            injection_index: r.injection_index,
            started_at: epoch(r.started_at),
            ended_at: epoch(r.last_seen),
          });
        }
        commit({ historyLoading: false });
      })
      .catch((e: Error) => {
        if (gen !== generation.current) return;
        for (const n of names) historyDone.current.delete(n);
        setState((prev) => ({ ...prev, historyLoading: false, historyError: e.message }));
      });
  }, [instrumentId, wantedKey, historyFn, commit]);

  return state;
}

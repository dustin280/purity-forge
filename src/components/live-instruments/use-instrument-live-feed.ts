import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to the Realtime broadcast topic `instrument:<id>` that
 * /api/instrument/feed fans out (see src/lib/instrument-feed.server.ts) and
 * accumulates the current run's samples per stream in memory. Buffers reset
 * whenever the run key changes (new injection, or back to idle), so a chart
 * fed from here always shows one run — or the rolling idle monitor.
 */

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
  /** run-relative seconds */
  t: number[];
  v: number[];
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
}

// Pressure arrives at 40 Hz; 60k points is 25 minutes — longer than any run
// here — while keeping an idle monitor from growing without bound.
const MAX_POINTS_PER_STREAM = 60000;

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
};

export function useInstrumentLiveFeed(instrumentId: string | null): LiveFeedState {
  const [state, setState] = useState<LiveFeedState>(EMPTY);
  const buffers = useRef<Record<string, StreamBuffer>>({});
  const runKey = useRef<string | null>(null);
  const labels = useRef<Record<string, string>>({});

  useEffect(() => {
    buffers.current = {};
    runKey.current = null;
    labels.current = {};
    setState(EMPTY);
    if (!instrumentId) return;

    const channel = supabase.channel(`instrument:${instrumentId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "batch" }, ({ payload }) => {
      const b = payload as FeedBatchPayload;
      const key = b.run?.key ?? null;
      if (key !== runKey.current) {
        buffers.current = {};
        runKey.current = key;
      }
      if (b.labels) labels.current = { ...labels.current, ...b.labels };
      for (const [name, chunk] of Object.entries(b.streams ?? {})) {
        let buf = buffers.current[name];
        if (!buf) {
          buf = {
            units: chunk.units,
            dt: chunk.dt,
            label: labels.current[name] ?? null,
            t: [],
            v: [],
          };
          buffers.current[name] = buf;
        }
        buf.label = labels.current[name] ?? buf.label;
        for (let i = 0; i < chunk.values.length; i++) {
          buf.t.push(chunk.t0 + i * chunk.dt);
          buf.v.push(chunk.values[i]);
        }
        const overflow = buf.t.length - MAX_POINTS_PER_STREAM;
        if (overflow > 0) {
          buf.t.splice(0, overflow);
          buf.v.splice(0, overflow);
        }
      }
      setState((prev) => ({
        ...prev,
        lastBatchAt: Date.now(),
        batchSeq: b.batch_seq,
        status: b.status,
        run: b.run ?? null,
        sequence: b.sequence ?? null,
        streams: { ...buffers.current },
        labels: { ...labels.current },
      }));
    });

    channel.on("broadcast", { event: "lifecycle" }, ({ payload }) => {
      const p = payload as FeedLifecyclePayload;
      if (p.type === "run_started") {
        buffers.current = {};
        runKey.current = p.run?.key ?? null;
      }
      setState((prev) => ({ ...prev, lastLifecycle: p, streams: { ...buffers.current } }));
    });

    channel.subscribe((status) => {
      setState((prev) => ({ ...prev, connected: status === "SUBSCRIBED" }));
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instrumentId]);

  return state;
}

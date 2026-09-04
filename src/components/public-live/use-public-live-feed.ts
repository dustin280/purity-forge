import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicLiveInstrument, PublicLiveSnapshot } from "@/lib/public-live.server";
import type { LiveRun, StreamBuffer } from "@/components/live-instruments/use-instrument-live-feed";
import { LIVE_HISTORY_MINUTES } from "@/components/live-instruments/use-instrument-live-feed";

/**
 * Live buffers for the public /live viewer, fed by polling
 * /api/public/live/snapshot with the viewer's token: the cached hour on the
 * first call, then only rows newer than the cursor every POLL_MS. Buffers are
 * the same shape as the private page's, so the charts are shared. A 401
 * (token expired or revoked) surfaces as `expired`.
 */

const POLL_MS = 2000;
const MAX_POINTS_PER_STREAM = 300_000;

export interface PublicLiveState {
  loading: boolean;
  error: string | null;
  expired: boolean;
  lastPollAt: number | null;
  /** bumps on every applied snapshot so memos rebuild */
  seq: number;
  sessionExpiresAt: string | null;
  instruments: PublicLiveInstrument[];
  instrumentId: string | null;
  streams: Record<string, StreamBuffer>;
  labels: Record<string, string>;
  runs: LiveRun[];
}

const EMPTY: PublicLiveState = {
  loading: true,
  error: null,
  expired: false,
  lastPollAt: null,
  seq: 0,
  sessionExpiresAt: null,
  instruments: [],
  instrumentId: null,
  streams: {},
  labels: {},
  runs: [],
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

export function usePublicLiveFeed(
  token: string | null,
  instrumentId: string | null,
  wantedStreams: string[],
): PublicLiveState {
  const [state, setState] = useState<PublicLiveState>(EMPTY);
  const buffers = useRef<Record<string, StreamBuffer>>({});
  const labels = useRef<Record<string, string>>({});
  const runs = useRef<Map<string, LiveRun>>(new Map());
  const cursor = useRef<string | null>(null);
  const loaded = useRef<Set<string>>(new Set());
  const generation = useRef(0);
  const inFlight = useRef(false);

  const commit = useCallback((extra: Partial<PublicLiveState> = {}) => {
    setState((prev) => ({
      ...prev,
      ...extra,
      seq: prev.seq + 1,
      streams: { ...buffers.current },
      labels: { ...labels.current },
      runs: [...runs.current.values()].sort((a, b) => a.started_at - b.started_at),
    }));
  }, []);

  const apply = useCallback((snap: PublicLiveSnapshot, names: string[], history: boolean) => {
    labels.current = { ...labels.current, ...snap.labels };
    for (const row of snap.rows) {
      const sentAt = epoch(row.sent_at);
      for (const [name, chunk] of Object.entries(row.streams)) {
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
        const lastX = buf.x.length ? buf.x[buf.x.length - 1] : -Infinity;
        for (let i = 0; i < chunk.values.length; i++) {
          const x = chunk.w0 + i * chunk.dt;
          if (x <= lastX) continue;
          buf.x.push(x);
          buf.v.push(chunk.values[i]);
        }
      }
      if (row.run_key && row.run_started_at) {
        const r = runs.current.get(row.run_key);
        if (r) r.ended_at = null;
        else
          runs.current.set(row.run_key, {
            key: row.run_key,
            injection_index: row.run_index ?? 1,
            started_at: epoch(row.run_started_at),
            ended_at: null,
          });
      }
      for (const r of runs.current.values())
        if (r.ended_at === null && r.key !== row.run_key) r.ended_at = sentAt;
    }
    let latest = -Infinity;
    for (const buf of Object.values(buffers.current))
      if (buf.x.length) latest = Math.max(latest, buf.x[buf.x.length - 1]);
    if (latest > -Infinity) {
      const horizon = latest - LIVE_HISTORY_MINUTES * 60 - 120;
      for (const buf of Object.values(buffers.current)) trimBuffer(buf, horizon);
    }
    if (history) for (const n of names) loaded.current.add(n);
    if (snap.cursor && (!cursor.current || snap.cursor > cursor.current))
      cursor.current = snap.cursor;
  }, []);

  // Reset when the token or instrument changes.
  useEffect(() => {
    generation.current += 1;
    buffers.current = {};
    labels.current = {};
    runs.current = new Map();
    cursor.current = null;
    loaded.current = new Set();
    setState({ ...EMPTY, loading: !!token });
  }, [token, instrumentId]);

  const wantedKey = wantedStreams.join(",");
  useEffect(() => {
    if (!token) return;
    const gen = generation.current;
    let timer: number | null = null;
    let stopped = false;

    async function fetchSnapshot(names: string[], history: boolean, since: string | null) {
      const params = new URLSearchParams();
      if (instrumentId) params.set("instrument", instrumentId);
      params.set("streams", names.join(","));
      if (history) params.set("history", "1");
      else if (since) params.set("since", since);
      const res = await fetch(`/api/public/live/snapshot?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) throw Object.assign(new Error("expired"), { expired: true });
      if (!res.ok) throw new Error(`Live feed unavailable (${res.status})`);
      return (await res.json()) as PublicLiveSnapshot;
    }

    async function tick() {
      if (stopped || inFlight.current) return;
      inFlight.current = true;
      try {
        const names = wantedKey.split(",").filter(Boolean);
        const fresh = names.filter((n) => !loaded.current.has(n));
        if (fresh.length > 0) {
          // History for streams we have not seen yet (also the very first call).
          const snap = await fetchSnapshot(fresh, true, null);
          if (stopped || gen !== generation.current) return;
          apply(snap, fresh, true);
          commit({
            loading: false,
            error: null,
            lastPollAt: Date.now(),
            sessionExpiresAt: snap.session_expires_at,
            instruments: snap.instruments,
            instrumentId: snap.instrument_id,
          });
        }
        if (names.length > 0) {
          const snap = await fetchSnapshot(names, false, cursor.current);
          if (stopped || gen !== generation.current) return;
          apply(snap, names, false);
          commit({
            loading: false,
            error: null,
            lastPollAt: Date.now(),
            sessionExpiresAt: snap.session_expires_at,
            instruments: snap.instruments,
            instrumentId: snap.instrument_id,
          });
        }
      } catch (e) {
        if (stopped || gen !== generation.current) return;
        if ((e as { expired?: boolean }).expired) {
          setState((prev) => ({ ...prev, loading: false, expired: true }));
          stopped = true;
          return;
        }
        setState((prev) => ({ ...prev, loading: false, error: (e as Error).message }));
      } finally {
        inFlight.current = false;
        if (!stopped) timer = window.setTimeout(tick, POLL_MS);
      }
    }

    void tick();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [token, instrumentId, wantedKey, apply, commit]);

  return state;
}

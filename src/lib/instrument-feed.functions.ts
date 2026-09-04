/**
 * Server functions behind the Live Instruments page and the admin feed-key
 * panel. Reads go through the caller's RLS-scoped client (all new tables are
 * readable by any authenticated user; feed keys are admin-only). Writes to
 * the feed tables only ever happen in instrument-feed.server.ts.
 */
import { randomBytes } from "crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import { LIVE_HISTORY_MINUTES, type RunSummary, type RunTrace } from "@/lib/instrument-feed.server";

/** Column record the instrument reported (see columnSchema in instrument-feed.server.ts). */
export interface InstrumentColumnInfo {
  slot?: number | null;
  description?: string | null;
  part_number?: string | null;
  serial?: string | null;
  batch?: string | null;
  comment?: string | null;
  diameter_mm?: number | null;
  length_mm?: number | null;
  particle_um?: number | null;
  max_pressure_bar?: number | null;
  max_temp_c?: number | null;
  injections?: number | null;
  first_used_at?: string | null;
  last_used_at?: string | null;
  tagged?: boolean;
  seen_at?: string | null;
  raw?: { [key: string]: Json };
}

/** OpenLab's run information for an injection (see runInfoSchema in instrument-feed.server.ts). */
export interface InstrumentRunInfo {
  sample_name?: string | null;
  sample_type?: string | null;
  method_name?: string | null;
  method_id?: string | null;
  sequence_name?: string | null;
  vial?: string | null;
  user_name?: string | null;
  project_name?: string | null;
  preview?: boolean;
  baseline_check?: boolean;
  received_at?: string | null;
}

export interface InstrumentLiveStatusRow {
  instrument_id: string;
  status: "offline" | "idle" | "running";
  run_state: number | null;
  analysis_state: number | null;
  ready_state: number | null;
  error_state: number | null;
  not_ready_text: string | null;
  current_sequence_id: string | null;
  current_run_id: string | null;
  last_batch_at: string | null;
  last_event_at: string | null;
  latest: Record<string, { v: number; t: number; units: string }>;
  streams: Array<{ name: string; units: string; dt: number }>;
  modules: Array<{ type: string; serial: string; name: string }>;
  column_info: InstrumentColumnInfo | null;
  agent_host: string | null;
  agent_version: string | null;
  updated_at: string;
}

/** JSON-shaped value; server-function results must be serializable, so `unknown` is not allowed here. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface InstrumentSequenceRow {
  id: string;
  instrument_id: string;
  agent_sequence_key: string;
  started_at: string;
  ended_at: string | null;
  status: "running" | "completed" | "aborted";
  injections_count: number;
  backpressure_log_id: string | null;
  meta: { [key: string]: Json };
}

export interface InstrumentRunRow {
  id: string;
  instrument_id: string;
  sequence_id: string | null;
  agent_run_key: string;
  injection_index: number;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  status: "running" | "completed" | "aborted";
  summary: RunSummary;
  trace_path: string | null;
  sample_position: string | null;
  column_name: string | null;
  column_info: InstrumentColumnInfo | null;
  sample_name: string | null;
  sample_type: string | null;
  method_name: string | null;
  sequence_name: string | null;
  run_info: InstrumentRunInfo | null;
  created_at: string;
}

export interface InstrumentLiveOverview {
  instrument: { id: string; name: string; location: string | null; is_active: boolean };
  status: InstrumentLiveStatusRow | null;
  current_run: InstrumentRunRow | null;
  current_sequence: InstrumentSequenceRow | null;
}

export const listInstrumentLiveOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstrumentLiveOverview[]> => {
    const db = context.supabase as AnySupabase;
    const [{ data: instruments, error: iErr }, { data: statuses, error: sErr }] = await Promise.all(
      [
        db
          .from("instruments")
          .select("id, name, location, is_active")
          .eq("is_active", true)
          .order("name"),
        db.from("instrument_live_status").select("*"),
      ],
    );
    if (iErr) throw iErr;
    if (sErr) throw sErr;
    const statusById = new Map<string, InstrumentLiveStatusRow>();
    for (const s of (statuses ?? []) as InstrumentLiveStatusRow[])
      statusById.set(s.instrument_id, s);

    const runIds = [...statusById.values()]
      .map((s) => s.current_run_id)
      .filter((v): v is string => !!v);
    const seqIds = [...statusById.values()]
      .map((s) => s.current_sequence_id)
      .filter((v): v is string => !!v);
    const [runs, seqs] = await Promise.all([
      runIds.length
        ? db.from("instrument_runs").select("*").in("id", runIds)
        : Promise.resolve({ data: [] }),
      seqIds.length
        ? db.from("instrument_sequences").select("*").in("id", seqIds)
        : Promise.resolve({ data: [] }),
    ]);
    const runById = new Map<string, InstrumentRunRow>();
    for (const r of (runs.data ?? []) as InstrumentRunRow[]) runById.set(r.id, r);
    const seqById = new Map<string, InstrumentSequenceRow>();
    for (const s of (seqs.data ?? []) as InstrumentSequenceRow[]) seqById.set(s.id, s);

    return ((instruments ?? []) as InstrumentLiveOverview["instrument"][]).map((instrument) => {
      const status = statusById.get(instrument.id) ?? null;
      return {
        instrument,
        status,
        current_run: status?.current_run_id ? (runById.get(status.current_run_id) ?? null) : null,
        current_sequence: status?.current_sequence_id
          ? (seqById.get(status.current_sequence_id) ?? null)
          : null,
      };
    });
  });

export const listInstrumentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        instrument_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ runs: InstrumentRunRow[]; sequences: InstrumentSequenceRow[] }> => {
      const db = context.supabase as AnySupabase;
      let q = db
        .from("instrument_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(data.limit ?? 50);
      if (data.instrument_id) q = q.eq("instrument_id", data.instrument_id);
      const { data: runs, error } = await q;
      if (error) throw error;
      const seqIds = [
        ...new Set(
          ((runs ?? []) as InstrumentRunRow[])
            .map((r) => r.sequence_id)
            .filter((v): v is string => !!v),
        ),
      ];
      const { data: sequences } = seqIds.length
        ? await db.from("instrument_sequences").select("*").in("id", seqIds)
        : { data: [] };
      return {
        runs: (runs ?? []) as InstrumentRunRow[],
        sequences: (sequences ?? []) as InstrumentSequenceRow[],
      };
    },
  );

export const getInstrumentRunTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(
    async ({ context, data }): Promise<{ run: InstrumentRunRow; trace: RunTrace | null }> => {
      const db = context.supabase as AnySupabase;
      const { data: run, error } = await db
        .from("instrument_runs")
        .select("*")
        .eq("id", data.run_id)
        .maybeSingle();
      if (error) throw error;
      if (!run) throw new Error("Run not found");
      if (!run.trace_path) return { run: run as InstrumentRunRow, trace: null };
      const { data: blob, error: dlErr } = await db.storage
        .from("instrument-traces")
        .download(run.trace_path);
      if (dlErr) throw new Error(`Trace download failed: ${dlErr.message}`);
      const trace = JSON.parse(await (blob as Blob).text()) as RunTrace;
      return { run: run as InstrumentRunRow, trace };
    },
  );

/* ---------------- live history cache ---------------- */

export interface LiveHistorySegment {
  /** epoch seconds of values[0] */
  w0: number;
  dt: number;
  values: number[];
}
export interface LiveHistoryStream {
  units: string;
  /** contiguous stretches, oldest first */
  segments: LiveHistorySegment[];
}
export interface LiveHistoryRun {
  key: string;
  injection_index: number;
  started_at: string;
  first_seen: string;
  last_seen: string;
}
export interface InstrumentLiveHistory {
  from: string;
  to: string;
  streams: Record<string, LiveHistoryStream>;
  runs: LiveHistoryRun[];
  labels: Record<string, string>;
}

const HISTORY_PAGE = 1000;
const HISTORY_MAX_ROWS = 4000;

/**
 * The last `minutes` of the requested streams from the rolling cache
 * (instrument_live_batches), stitched into contiguous segments so the page
 * can draw the recent past before the first live batch arrives. Only the
 * requested streams are pulled out of each row's jsonb.
 */
export const getInstrumentLiveHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        instrument_id: z.string().uuid(),
        minutes: z.number().int().min(1).max(LIVE_HISTORY_MINUTES).optional(),
        streams: z
          .array(z.string().regex(/^[A-Za-z0-9_]{1,64}$/))
          .min(1)
          .max(24),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<InstrumentLiveHistory> => {
    const db = context.supabase as AnySupabase;
    const minutes = data.minutes ?? LIVE_HISTORY_MINUTES;
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60_000);
    const names = [...new Set(data.streams)];
    const select = [
      "sent_at",
      "run_key",
      "run_index",
      "run_started_at",
      "labels",
      ...names.map((n, i) => `s${i}:streams->${n}`),
    ].join(",");

    type Chunk = { units: string; dt: number; w0: number; values: number[] } | null;
    type Row = {
      sent_at: string;
      run_key: string | null;
      run_index: number | null;
      run_started_at: string | null;
      labels: Record<string, string> | null;
    } & Record<string, unknown>;

    const streams: Record<string, LiveHistoryStream> = {};
    const runs = new Map<string, LiveHistoryRun>();
    let labels: Record<string, string> = {};
    for (let offset = 0; offset < HISTORY_MAX_ROWS; offset += HISTORY_PAGE) {
      const { data: rows, error } = await db
        .from("instrument_live_batches")
        .select(select)
        .eq("instrument_id", data.instrument_id)
        .gte("sent_at", from.toISOString())
        .order("sent_at", { ascending: true })
        .range(offset, offset + HISTORY_PAGE - 1);
      if (error) throw error;
      const page = (rows ?? []) as Row[];
      for (const row of page) {
        if (row.labels) labels = { ...labels, ...row.labels };
        if (row.run_key && row.run_started_at) {
          const r = runs.get(row.run_key);
          if (r) r.last_seen = row.sent_at;
          else
            runs.set(row.run_key, {
              key: row.run_key,
              injection_index: row.run_index ?? 1,
              started_at: row.run_started_at,
              first_seen: row.sent_at,
              last_seen: row.sent_at,
            });
        }
        names.forEach((name, i) => {
          const chunk = row[`s${i}`] as Chunk;
          if (!chunk || !Array.isArray(chunk.values) || chunk.values.length === 0) return;
          let s = streams[name];
          if (!s) s = streams[name] = { units: chunk.units, segments: [] };
          const last = s.segments[s.segments.length - 1];
          if (
            last &&
            last.dt === chunk.dt &&
            Math.abs(chunk.w0 - (last.w0 + last.values.length * last.dt)) < chunk.dt * 0.6 + 0.05
          ) {
            last.values.push(...chunk.values);
          } else {
            s.segments.push({ w0: chunk.w0, dt: chunk.dt, values: [...chunk.values] });
          }
        });
      }
      if (page.length < HISTORY_PAGE) break;
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      streams,
      runs: [...runs.values()],
      labels,
    };
  });

/* ---------------- continuous pressure log ---------------- */

export interface InstrumentPressureLogRow {
  id: string;
  instrument_id: string;
  /** start of the aggregation window */
  logged_at: string;
  window_s: number;
  samples: number;
  /** window mean */
  pressure_bar: number;
  pressure_min_bar: number | null;
  pressure_max_bar: number | null;
  flow_ml_min: number | null;
  column_temp_c: number | null;
  state: "idle" | "running";
  sequence_id: string | null;
  run_id: string | null;
  /** hplc_columns.name of the column the instrument reported at the time */
  column_name: string | null;
}

/** PostgREST returns at most 1000 rows per request, so a range is read page by page. */
const PRESSURE_LOG_PAGE = 1000;
/** ~14 instrument-days at one entry per minute; wider ranges are truncated (newest first). */
const PRESSURE_LOG_MAX_ROWS = 20000;

export const listInstrumentPressureLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        instrument_id: z.string().uuid().nullable().optional(),
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        state: z.enum(["idle", "running"]).nullable().optional(),
        pump_on_only: z.boolean().optional(),
        column: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ rows: InstrumentPressureLogRow[]; truncated: boolean }> => {
      const db = context.supabase as AnySupabase;
      const rows: InstrumentPressureLogRow[] = [];
      for (let offset = 0; offset < PRESSURE_LOG_MAX_ROWS; offset += PRESSURE_LOG_PAGE) {
        let q = db
          .from("instrument_pressure_log")
          .select("*")
          .gte("logged_at", data.from)
          .lt("logged_at", data.to)
          .order("logged_at", { ascending: false })
          .range(offset, offset + PRESSURE_LOG_PAGE - 1);
        if (data.instrument_id) q = q.eq("instrument_id", data.instrument_id);
        if (data.state) q = q.eq("state", data.state);
        if (data.pump_on_only) q = q.gt("flow_ml_min", 0);
        if (data.column) q = q.eq("column_name", data.column);
        const { data: page, error } = await q;
        if (error) throw error;
        const got = (page ?? []) as InstrumentPressureLogRow[];
        rows.push(...got);
        if (got.length < PRESSURE_LOG_PAGE) return { rows, truncated: false };
      }
      return { rows, truncated: true };
    },
  );

export interface PressureLogColumn {
  column_name: string;
  entries: number;
  first_at: string;
  last_at: string;
}

/** Columns the instrument reported over a window, newest first (for the column selectors). */
export const listPressureLogColumns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        instrument_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<PressureLogColumn[]> => {
    const db = context.supabase as AnySupabase;
    const { data: rows, error } = await db.rpc("instrument_pressure_log_columns", {
      p_from: data.from,
      p_to: data.to,
      p_instrument_id: data.instrument_id ?? null,
    });
    if (error) throw error;
    return (rows ?? []) as PressureLogColumn[];
  });

export interface PressureDailyBookend {
  instrument_id: string;
  instrument_name: string;
  /** YYYY-MM-DD in the requested time zone */
  day: string;
  first_at: string;
  first_bar: number;
  last_at: string;
  last_bar: number;
  readings: number;
  min_bar: number;
  max_bar: number;
  /** when the day's peak (max_bar) was logged, and that minute's mean */
  max_at: string;
  max_mean_bar: number;
}

/**
 * Per local day: first, last and peak continuous-log entries (dashboard chart).
 * By default only entries logged while the pump was delivering count, since
 * pressure with the pump off says nothing about the column.
 */
export const getInstrumentPressureDailyBookends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        /** IANA zone name of the viewer, e.g. America/Los_Angeles */
        tz: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9_+\-/]+$/),
        instrument_id: z.string().uuid().nullable().optional(),
        pump_on_only: z.boolean().optional(),
        column: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<PressureDailyBookend[]> => {
    const db = context.supabase as AnySupabase;
    const [{ data: rows, error }, { data: instruments }] = await Promise.all([
      db.rpc("instrument_pressure_daily_bookends", {
        p_from: data.from,
        p_to: data.to,
        p_tz: data.tz,
        p_instrument_id: data.instrument_id ?? null,
        p_min_flow: data.pump_on_only === false ? null : 0,
        p_column: data.column ?? null,
      }),
      db.from("instruments").select("id, name"),
    ]);
    if (error) throw error;
    const names = new Map<string, string>();
    for (const i of (instruments ?? []) as Array<{ id: string; name: string }>)
      names.set(i.id, i.name);
    return ((rows ?? []) as Array<Omit<PressureDailyBookend, "instrument_name">>).map((r) => ({
      ...r,
      instrument_name: names.get(r.instrument_id) ?? "Unknown instrument",
    }));
  });

export interface PressureDailyByColumn {
  /** YYYY-MM-DD in the requested time zone */
  day: string;
  /** null = entries logged before any column record was seen */
  column_name: string | null;
  instrument_id: string;
  instrument_name: string;
  readings: number;
  first_at: string;
  first_bar: number;
  last_at: string;
  last_bar: number;
  min_bar: number;
  max_bar: number;
  max_at: string;
  max_mean_bar: number;
}

/**
 * The continuous log per local day AND column (Daily Backpressure page):
 * peak with its time, first/last, min, entry count. Pump-delivering entries
 * only by default, as on the dashboard.
 */
export const listPressureDailyByColumn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        tz: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9_+\-/]+$/),
        pump_on_only: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<PressureDailyByColumn[]> => {
    const db = context.supabase as AnySupabase;
    const [{ data: rows, error }, { data: instruments }] = await Promise.all([
      db.rpc("instrument_pressure_daily_by_column", {
        p_from: data.from,
        p_to: data.to,
        p_tz: data.tz,
        p_min_flow: data.pump_on_only === false ? null : 0,
      }),
      db.from("instruments").select("id, name"),
    ]);
    if (error) throw error;
    const names = new Map<string, string>();
    for (const i of (instruments ?? []) as Array<{ id: string; name: string }>)
      names.set(i.id, i.name);
    return ((rows ?? []) as Array<Omit<PressureDailyByColumn, "instrument_name">>).map((r) => ({
      ...r,
      instrument_name: names.get(r.instrument_id) ?? "Unknown instrument",
    }));
  });

/* ---------------- admin: feed keys ---------------- */

export interface InstrumentFeedKeyRow {
  id: string;
  instrument_id: string;
  label: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  last_agent_host: string | null;
  last_agent_version: string | null;
  /** last 4 characters of the secret, for telling keys apart */
  secret_hint: string;
}

async function assertAdmin(db: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listInstrumentFeedKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instrument_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<InstrumentFeedKeyRow[]> => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { data: rows, error } = await db
      .from("instrument_feed_keys")
      .select(
        "id, instrument_id, label, secret, is_active, created_at, last_seen_at, last_agent_host, last_agent_version",
      )
      .eq("instrument_id", data.instrument_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((rows ?? []) as Array<InstrumentFeedKeyRow & { secret: string }>).map(
      ({ secret, ...rest }) => ({
        ...rest,
        secret_hint: secret.slice(-4),
      }),
    );
  });

export const createInstrumentFeedKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ instrument_id: z.string().uuid(), label: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ id: string; secret: string }> => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const secret = randomBytes(32).toString("hex");
    const { data: row, error } = await db
      .from("instrument_feed_keys")
      .insert({
        instrument_id: data.instrument_id,
        label: data.label?.trim() || "default",
        secret,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    // The secret is returned exactly once; only its last 4 chars are shown afterwards.
    return { id: row.id, secret };
  });

export const revokeInstrumentFeedKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { error } = await db
      .from("instrument_feed_keys")
      .update({ is_active: false })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

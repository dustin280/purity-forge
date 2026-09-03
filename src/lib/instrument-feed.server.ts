/**
 * Live instrument feed — server-side processing.
 *
 * An on-prem agent (tools/agilent-tap-agent/) passively captures the Agilent
 * instrument LAN, decodes the pump / DAD / thermostat streams, and calls:
 *
 *   POST /api/instrument/feed   — once a second while the instrument is on:
 *                                 the newest samples per stream + status.
 *                                 Fanned out over Supabase Realtime broadcast
 *                                 (topic `instrument:<id>`, event `batch`) for
 *                                 the Live Instruments page, and folded into
 *                                 instrument_live_status. Never stored per
 *                                 sample.
 *   POST /api/instrument/event  — lifecycle: sequence_started, run_started,
 *                                 run_completed (with the decoded per-run
 *                                 traces + summary), sequence_completed,
 *                                 heartbeat. These maintain
 *                                 instrument_sequences / instrument_runs, store
 *                                 traces in the instrument-traces bucket, and
 *                                 write the Daily Backpressure row. Plus
 *                                 pressure_log once a minute (idle or running):
 *                                 the window's mean/min/max pressure, flow and
 *                                 column temperature -> instrument_pressure_log,
 *                                 the continuous log behind the Instrument
 *                                 Pressure Log page and the dashboard's daily
 *                                 first/last chart.
 *
 * Daily Backpressure semantics deliberately mirror the retired Drive .dx
 * importer (archive/drive-pressure-importer/) so the trend chart is
 * continuous across the switch-over: one row per *sequence*, `backpressure` /
 * flow / column temp = mean over the first 15 s of the sequence's first
 * injection (the agent computes those from the same streams the .dx files
 * contain), run min/max widened as later injections complete, injections
 * counted as they happen, and the installed HPLC column's injection counter
 * bumped per injection.
 *
 * Both routes authenticate with a per-instrument HMAC key
 * (instrument-feed-auth.server.ts). Time strings from the agent are the lab
 * PC's clock in ISO-8601 with offset.
 */
import { z } from "zod";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";

/* ---------------- payload schemas (shared with the agent) ---------------- */

const streamSchema = z.object({
  units: z.string().max(16),
  /** run-relative seconds of values[0] (seconds since the agent's stream anchor when idle) */
  t0: z.number().finite(),
  /** seconds between consecutive values */
  dt: z.number().positive(),
  values: z.array(z.number().finite()).max(20000),
});
export type FeedStream = z.infer<typeof streamSchema>;

const statusSchema = z.object({
  state: z.enum(["idle", "running"]),
  run_state: z.number().int().nullable().optional(),
  analysis_state: z.number().int().nullable().optional(),
  ready_state: z.number().int().nullable().optional(),
  error_state: z.number().int().nullable().optional(),
  not_ready_text: z.string().max(500).nullable().optional(),
});

const agentSchema = z
  .object({
    host: z.string().max(120).nullable().optional(),
    version: z.string().max(32).nullable().optional(),
  })
  .optional();

const sequenceRefSchema = z.object({
  key: z.string().min(1).max(64),
  started_at: z.string().max(40),
});

const runRefSchema = z.object({
  key: z.string().min(1).max(64),
  injection_index: z.number().int().min(1).max(100000),
  started_at: z.string().max(40),
  sample_position: z.string().max(64).nullable().optional(),
});

const moduleSchema = z.object({
  type: z.string().max(32),
  serial: z.string().max(64),
  name: z.string().max(64),
});

export const feedBatchSchema = z.object({
  agent: agentSchema,
  sent_at: z.string().max(40),
  batch_seq: z.number().int().min(0),
  status: statusSchema,
  sequence: sequenceRefSchema.nullable().optional(),
  run: runRefSchema.nullable().optional(),
  streams: z
    .record(
      z.string().max(64),
      streamSchema.extend({ values: z.array(z.number().finite()).max(2000) }),
    )
    .default({}),
  /** human labels per stream, e.g. DAD1A -> "214 nm" (from the DAD's own status text) */
  labels: z.record(z.string().max(64), z.string().max(64)).optional(),
  modules: z.array(moduleSchema).max(16).optional(),
});
export type FeedBatch = z.infer<typeof feedBatchSchema>;

const summarySchema = z.object({
  initiation: z
    .object({
      pressure_bar: z.number().finite().nullable(),
      flow_ml_min: z.number().finite().nullable(),
      column_temp_c: z.number().finite().nullable(),
    })
    .optional(),
  pressure_min_bar: z.number().finite().nullable().optional(),
  pressure_max_bar: z.number().finite().nullable().optional(),
  wavelengths_nm: z.record(z.string().max(8), z.number()).optional(),
  method: z.string().max(255).nullable().optional(),
});
export type RunSummary = z.infer<typeof summarySchema>;

const traceSchema = z.object({
  version: z.number().int(),
  streams: z.record(z.string().max(64), streamSchema),
  wavelengths_nm: z.record(z.string().max(8), z.number()).optional(),
});
export type RunTrace = z.infer<typeof traceSchema>;

const eventBase = { sent_at: z.string().max(40), agent: agentSchema };

export const feedEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heartbeat"),
    ...eventBase,
    status: statusSchema,
    modules: z.array(moduleSchema).max(16).optional(),
  }),
  z.object({
    type: z.literal("sequence_started"),
    ...eventBase,
    sequence: sequenceRefSchema,
    modules: z.array(moduleSchema).max(16).optional(),
  }),
  z.object({
    type: z.literal("run_started"),
    ...eventBase,
    sequence: sequenceRefSchema.nullable().optional(),
    run: runRefSchema,
  }),
  z.object({
    type: z.literal("run_completed"),
    ...eventBase,
    sequence: sequenceRefSchema.nullable().optional(),
    run: runRefSchema,
    ended_at: z.string().max(40),
    duration_s: z.number().finite().nullable().optional(),
    summary: summarySchema,
    trace: traceSchema.optional(),
  }),
  z.object({
    type: z.literal("sequence_completed"),
    ...eventBase,
    sequence: sequenceRefSchema,
    ended_at: z.string().max(40),
  }),
  z.object({
    type: z.literal("pressure_log"),
    ...eventBase,
    /** start of the aggregation window */
    at: z.string().max(40),
    window_s: z.number().int().min(1).max(3600),
    pressure: z.object({
      mean: z.number().finite(),
      min: z.number().finite(),
      max: z.number().finite(),
      n: z.number().int().min(1),
    }),
    flow_ml_min: z.number().finite().nullable().optional(),
    column_temp_c: z.number().finite().nullable().optional(),
    state: z.enum(["idle", "running"]),
    sequence: sequenceRefSchema.nullable().optional(),
    run: runRefSchema.nullable().optional(),
  }),
]);
export type FeedEvent = z.infer<typeof feedEventSchema>;

/* ---------------- helpers ---------------- */

const TRACES_BUCKET = "instrument-traces";
const LIVE_USER_NAME = "Live Instrument Feed";

function toIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function round(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

async function adminDb(): Promise<AnySupabase> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as AnySupabase;
}

/**
 * Fan a message out to browsers subscribed to `instrument:<id>` via the
 * Realtime REST broadcast endpoint. Awaited (not fire-and-forget) because a
 * Workers request can be torn down once its response is sent.
 */
export async function broadcastInstrument(
  instrumentId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error(
      "[instrument-feed] realtime broadcast not configured (SUPABASE_URL / key missing)",
    );
    return;
  }
  try {
    const r = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: `instrument:${instrumentId}`, event, payload }] }),
    });
    if (!r.ok) console.error("[instrument-feed] broadcast failed", r.status, await r.text());
  } catch (e) {
    console.error("[instrument-feed] broadcast error", e);
  }
}

type StatusPatch = Record<string, unknown>;

function statusPatch(
  status: FeedBatch["status"],
  agent: FeedBatch["agent"],
  now: string,
): StatusPatch {
  return {
    status: status.state,
    run_state: status.run_state ?? null,
    analysis_state: status.analysis_state ?? null,
    ready_state: status.ready_state ?? null,
    error_state: status.error_state ?? null,
    not_ready_text: status.not_ready_text ?? null,
    agent_host: agent?.host ?? null,
    agent_version: agent?.version ?? null,
    updated_at: now,
  };
}

async function upsertLiveStatus(
  db: AnySupabase,
  instrumentId: string,
  patch: StatusPatch,
): Promise<void> {
  const { error } = await db
    .from("instrument_live_status")
    .upsert({ instrument_id: instrumentId, ...patch }, { onConflict: "instrument_id" });
  if (error) throw new Error(`instrument_live_status upsert failed: ${error.message}`);
}

async function ensureSequence(
  db: AnySupabase,
  instrumentId: string,
  ref: z.infer<typeof sequenceRefSchema>,
  meta?: Record<string, unknown>,
): Promise<{
  id: string;
  started_at: string;
  injections_count: number;
  backpressure_log_id: string | null;
}> {
  const { data: existing } = await db
    .from("instrument_sequences")
    .select("id, started_at, injections_count, backpressure_log_id")
    .eq("instrument_id", instrumentId)
    .eq("agent_sequence_key", ref.key)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await db
    .from("instrument_sequences")
    .insert({
      instrument_id: instrumentId,
      agent_sequence_key: ref.key,
      started_at: toIso(ref.started_at) ?? new Date().toISOString(),
      status: "running",
      meta: meta ?? {},
    })
    .select("id, started_at, injections_count, backpressure_log_id")
    .single();
  if (error) throw new Error(`instrument_sequences insert failed: ${error.message}`);
  return data;
}

async function upsertRun(
  db: AnySupabase,
  instrumentId: string,
  sequenceId: string | null,
  ref: z.infer<typeof runRefSchema>,
  extra: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("instrument_runs")
    .upsert(
      {
        instrument_id: instrumentId,
        sequence_id: sequenceId,
        agent_run_key: ref.key,
        injection_index: ref.injection_index,
        started_at: toIso(ref.started_at) ?? new Date().toISOString(),
        sample_position: ref.sample_position ?? null,
        ...extra,
      },
      { onConflict: "instrument_id,agent_run_key" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`instrument_runs upsert failed: ${error.message}`);
  return data;
}

async function installedColumn(
  db: AnySupabase,
  instrumentId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await db
    .from("hplc_columns")
    .select("id, name")
    .eq("installed_on_instrument_id", instrumentId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/* ---------------- batch ---------------- */

export async function processFeedBatch(instrumentId: string, batch: FeedBatch): Promise<void> {
  const db = await adminDb();
  const now = new Date().toISOString();

  const { data: current } = await db
    .from("instrument_live_status")
    .select("latest, streams")
    .eq("instrument_id", instrumentId)
    .maybeSingle();

  const latest: Record<string, { v: number; t: number; units: string }> = {
    ...((current?.latest as object) ?? {}),
  };
  const streams: Record<string, { units: string; dt: number; label: string | null }> = {};
  for (const s of (current?.streams as Array<{
    name: string;
    units: string;
    dt: number;
    label?: string | null;
  }> | null) ?? []) {
    streams[s.name] = { units: s.units, dt: s.dt, label: s.label ?? null };
  }
  for (const [name, s] of Object.entries(batch.streams)) {
    streams[name] = {
      units: s.units,
      dt: s.dt,
      label: batch.labels?.[name] ?? streams[name]?.label ?? null,
    };
    if (s.values.length > 0) {
      latest[name] = {
        v: s.values[s.values.length - 1],
        t: s.t0 + s.dt * (s.values.length - 1),
        units: s.units,
      };
    }
  }

  const patch: StatusPatch = {
    ...statusPatch(batch.status, batch.agent, now),
    last_batch_at: now,
    latest,
    streams: Object.entries(streams).map(([name, s]) => ({ name, ...s })),
  };
  if (batch.modules?.length) patch.modules = batch.modules;
  await upsertLiveStatus(db, instrumentId, patch);

  await broadcastInstrument(instrumentId, "batch", {
    sent_at: batch.sent_at,
    batch_seq: batch.batch_seq,
    status: batch.status,
    sequence: batch.sequence ?? null,
    run: batch.run ?? null,
    streams: batch.streams,
    labels: batch.labels ?? null,
  });
}

/* ---------------- events ---------------- */

async function writeBackpressureForSequence(
  db: AnySupabase,
  instrumentId: string,
  seq: {
    id: string;
    started_at: string;
    injections_count: number;
    backpressure_log_id: string | null;
  },
  injectionsCount: number,
  summary: RunSummary,
  sequenceKey: string,
): Promise<void> {
  const pressureMin = round(summary.pressure_min_bar ?? null, 2);
  const pressureMax = round(summary.pressure_max_bar ?? null, 2);

  if (seq.backpressure_log_id) {
    const { data: row } = await db
      .from("daily_backpressure_logs")
      .select("id, pressure_run_min, pressure_run_max")
      .eq("id", seq.backpressure_log_id)
      .maybeSingle();
    if (!row) return;
    const nextMin =
      pressureMin === null
        ? row.pressure_run_min
        : row.pressure_run_min === null
          ? pressureMin
          : Math.min(row.pressure_run_min, pressureMin);
    const nextMax =
      pressureMax === null
        ? row.pressure_run_max
        : row.pressure_run_max === null
          ? pressureMax
          : Math.max(row.pressure_run_max, pressureMax);
    const { error } = await db
      .from("daily_backpressure_logs")
      .update({
        injections_count: injectionsCount,
        pressure_run_min: nextMin,
        pressure_run_max: nextMax,
      })
      .eq("id", row.id);
    if (error) throw new Error(`daily_backpressure_logs update failed: ${error.message}`);
    return;
  }

  const initiation = summary.initiation;
  if (!initiation || initiation.pressure_bar === null) return; // nothing representative to log yet

  const [{ data: instrument }, column] = await Promise.all([
    db.from("instruments").select("name").eq("id", instrumentId).maybeSingle(),
    installedColumn(db, instrumentId),
  ]);
  const flow = round(initiation.flow_ml_min, 3);
  const temp = round(initiation.column_temp_c, 1);
  const { data: inserted, error } = await db
    .from("daily_backpressure_logs")
    .insert({
      reading_at: seq.started_at,
      user_name: LIVE_USER_NAME,
      instrument: instrument?.name ?? "Unknown instrument",
      backpressure: round(initiation.pressure_bar, 2),
      backpressure_unit: "bar",
      flow_rate: flow,
      flow_rate_unit: flow !== null ? "mL/min" : null,
      column_temp: temp,
      column_temp_unit: temp !== null ? "C" : null,
      column_name: column?.name ?? null,
      injections_count: injectionsCount,
      acquisition_method: summary.method ?? null,
      source: "live",
      notes: `Live feed · sequence ${sequenceKey}`,
      pressure_run_min: pressureMin,
      pressure_run_max: pressureMax,
      instrument_id: instrumentId,
      instrument_sequence_id: seq.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(`daily_backpressure_logs insert failed: ${error.message}`);
  await db
    .from("instrument_sequences")
    .update({ backpressure_log_id: inserted.id })
    .eq("id", seq.id);
}

export async function processFeedEvent(
  instrumentId: string,
  event: FeedEvent,
): Promise<Record<string, unknown>> {
  const db = await adminDb();
  const now = new Date().toISOString();

  switch (event.type) {
    case "heartbeat": {
      const patch: StatusPatch = {
        ...statusPatch(event.status, event.agent, now),
        last_event_at: now,
      };
      if (event.modules?.length) patch.modules = event.modules;
      await upsertLiveStatus(db, instrumentId, patch);
      return { ok: true };
    }

    case "sequence_started": {
      const seq = await ensureSequence(
        db,
        instrumentId,
        event.sequence,
        event.modules ? { modules: event.modules } : {},
      );
      const patch: StatusPatch = {
        current_sequence_id: seq.id,
        last_event_at: now,
        updated_at: now,
      };
      if (event.modules?.length) patch.modules = event.modules;
      await upsertLiveStatus(db, instrumentId, patch);
      await broadcastInstrument(instrumentId, "lifecycle", {
        type: event.type,
        sequence: event.sequence,
        sequence_id: seq.id,
      });
      return { ok: true, sequence_id: seq.id };
    }

    case "run_started": {
      const seq = event.sequence ? await ensureSequence(db, instrumentId, event.sequence) : null;
      const run = await upsertRun(db, instrumentId, seq?.id ?? null, event.run, {
        status: "running",
      });
      if (seq) {
        await db
          .from("instrument_sequences")
          .update({ injections_count: Math.max(seq.injections_count, event.run.injection_index) })
          .eq("id", seq.id);
      }
      await upsertLiveStatus(db, instrumentId, {
        status: "running",
        current_run_id: run.id,
        current_sequence_id: seq?.id ?? null,
        last_event_at: now,
        updated_at: now,
      });
      await broadcastInstrument(instrumentId, "lifecycle", {
        type: event.type,
        run: event.run,
        run_id: run.id,
        sequence: event.sequence ?? null,
        sequence_id: seq?.id ?? null,
      });
      return { ok: true, run_id: run.id, sequence_id: seq?.id ?? null };
    }

    case "run_completed": {
      // A run outside any sequence is logged as its own one-injection sequence
      // so the Daily Backpressure grain stays "one row per sequence".
      const seqRef = event.sequence ?? {
        key: `run:${event.run.key}`,
        started_at: event.run.started_at,
      };
      const seq = await ensureSequence(db, instrumentId, seqRef);
      const injectionsCount = Math.max(seq.injections_count, event.run.injection_index);

      let tracePath: string | null = null;
      if (event.trace) {
        tracePath = `${instrumentId}/${event.run.key}.json`;
        const body = JSON.stringify({
          ...event.trace,
          instrument_id: instrumentId,
          run_key: event.run.key,
          started_at: event.run.started_at,
          ended_at: event.ended_at,
          summary: event.summary,
        });
        const { error: upErr } = await db.storage
          .from(TRACES_BUCKET)
          .upload(tracePath, new Blob([body], { type: "application/json" }), {
            upsert: true,
            contentType: "application/json",
          });
        if (upErr) {
          console.error("[instrument-feed] trace upload failed", upErr);
          tracePath = null;
        }
      }

      const run = await upsertRun(db, instrumentId, seq.id, event.run, {
        status: "completed",
        ended_at: toIso(event.ended_at) ?? now,
        duration_s: event.duration_s ?? null,
        summary: event.summary,
        ...(tracePath ? { trace_path: tracePath } : {}),
      });

      await db
        .from("instrument_sequences")
        .update({ injections_count: injectionsCount })
        .eq("id", seq.id);
      await writeBackpressureForSequence(
        db,
        instrumentId,
        seq,
        injectionsCount,
        event.summary,
        seqRef.key,
      );

      const column = await installedColumn(db, instrumentId);
      if (column) {
        const { error } = await db.rpc("increment_hplc_column_injections", {
          p_column_id: column.id,
          p_count: 1,
        });
        if (error) console.error("[instrument-feed] column injection increment failed", error);
      }

      await upsertLiveStatus(db, instrumentId, {
        current_run_id: null,
        last_event_at: now,
        updated_at: now,
      });
      await broadcastInstrument(instrumentId, "lifecycle", {
        type: event.type,
        run: event.run,
        run_id: run.id,
        sequence_id: seq.id,
        summary: event.summary,
        trace_available: tracePath !== null,
      });
      return { ok: true, run_id: run.id, sequence_id: seq.id, trace_path: tracePath };
    }

    case "sequence_completed": {
      const seq = await ensureSequence(db, instrumentId, event.sequence);
      await db
        .from("instrument_sequences")
        .update({ status: "completed", ended_at: toIso(event.ended_at) ?? now })
        .eq("id", seq.id);
      await upsertLiveStatus(db, instrumentId, {
        current_sequence_id: null,
        current_run_id: null,
        last_event_at: now,
        updated_at: now,
      });
      await broadcastInstrument(instrumentId, "lifecycle", {
        type: event.type,
        sequence: event.sequence,
        sequence_id: seq.id,
      });
      return { ok: true, sequence_id: seq.id };
    }

    case "pressure_log": {
      const loggedAt = toIso(event.at);
      // An unparseable timestamp can't be fixed by the agent retrying, so
      // acknowledge and drop rather than answer 500 forever.
      if (!loggedAt) return { ok: true, dropped: "invalid timestamp" };
      const [seq, run] = await Promise.all([
        event.sequence
          ? db
              .from("instrument_sequences")
              .select("id")
              .eq("instrument_id", instrumentId)
              .eq("agent_sequence_key", event.sequence.key)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        event.run
          ? db
              .from("instrument_runs")
              .select("id")
              .eq("instrument_id", instrumentId)
              .eq("agent_run_key", event.run.key)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const { error } = await db.from("instrument_pressure_log").upsert(
        {
          instrument_id: instrumentId,
          logged_at: loggedAt,
          window_s: event.window_s,
          samples: event.pressure.n,
          pressure_bar: round(event.pressure.mean, 3),
          pressure_min_bar: round(event.pressure.min, 3),
          pressure_max_bar: round(event.pressure.max, 3),
          flow_ml_min: round(event.flow_ml_min ?? null, 4),
          column_temp_c: round(event.column_temp_c ?? null, 2),
          state: event.state,
          sequence_id: seq.data?.id ?? null,
          run_id: run.data?.id ?? null,
        },
        { onConflict: "instrument_id,logged_at" },
      );
      if (error) throw new Error(`instrument_pressure_log upsert failed: ${error.message}`);
      return { ok: true };
    }
  }
}

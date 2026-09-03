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
import type { RunSummary, RunTrace } from "@/lib/instrument-feed.server";

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

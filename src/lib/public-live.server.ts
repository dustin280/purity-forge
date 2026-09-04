/**
 * Public live-feed viewer (/live): one-time passcodes, 12-hour sessions, and
 * the snapshot the page polls. Guests have no Supabase login, so nothing here
 * touches RLS: the API routes verify the session token and read with the
 * service role. Data comes from the same rolling cache the private Live page
 * uses (instrument_live_batches, see instrument-feed.server.ts), which keeps
 * anonymous viewers off the Realtime channel entirely.
 *
 * Deliberately narrow (Dustin, 2026-09-04): a viewer sees the sample name
 * and the chromatogram, nothing else — only detector signals are served, no
 * method/column/pressure, and the token cannot reach any other route.
 */
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import { LIVE_HISTORY_MINUTES } from "@/lib/instrument-feed.server";

/**
 * A watch session is a fixed 12-hour window starting when the code is
 * generated: the invite can say exactly when it expires, and redeeming late
 * only shortens the viewing, never extends it.
 */
export const PUBLIC_LIVE_SESSION_HOURS = 12;
/** Unambiguous: no 0/O, 1/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
/** The only streams a public viewer can ask for. */
const PUBLIC_STREAM_RE = /^DAD1[A-H]$/;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** e.g. "K7QM-3XZP" — 32^8 possibilities, shown once. */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]; // 256 = 8 x 32: uniform
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export interface PublicLiveSession {
  id: string;
  label: string | null;
  /** null = any active instrument */
  instrument_id: string | null;
  session_expires_at: string;
}

export type RedeemResult =
  | { ok: true; token: string; session: PublicLiveSession }
  | { ok: false; status: number; error: string };

/** Turn a passcode into a session token, exactly once. */
export async function redeemPublicLiveCode(
  db: AnySupabase,
  rawCode: string,
): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    return { ok: false, status: 400, error: "That doesn't look like a passcode." };
  }
  const hash = await sha256Hex(code);
  const { data: row } = await db
    .from("public_live_access_codes")
    .select("id, label, instrument_id, code_expires_at, redeemed_at, revoked_at")
    .eq("code_hash", hash)
    .maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Unknown passcode." };
  if (row.revoked_at) return { ok: false, status: 410, error: "This passcode has been revoked." };
  if (row.redeemed_at)
    return { ok: false, status: 410, error: "This passcode has already been used." };
  if (new Date(row.code_expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      error: "This watch session has expired. Ask for a new passcode.",
    };
  }
  const token = randomToken();
  const now = new Date();
  // The session ends when the invite said it would, whenever it was redeemed.
  const expires = new Date(row.code_expires_at);
  // The `is null` guard makes two simultaneous redemptions of one code
  // impossible: only the first update matches a row.
  const { data: updated, error } = await db
    .from("public_live_access_codes")
    .update({
      redeemed_at: now.toISOString(),
      session_token_hash: await sha256Hex(token),
      session_expires_at: expires.toISOString(),
      last_seen_at: now.toISOString(),
    })
    .eq("id", row.id)
    .is("redeemed_at", null)
    .select("id");
  if (error) throw new Error(`redeem failed: ${error.message}`);
  if (!updated || updated.length === 0) {
    return { ok: false, status: 410, error: "This passcode has already been used." };
  }
  return {
    ok: true,
    token,
    session: {
      id: row.id,
      label: row.label ?? null,
      instrument_id: row.instrument_id ?? null,
      session_expires_at: expires.toISOString(),
    },
  };
}

/** The session behind a bearer token, or null when it is unknown, expired or revoked. */
export async function verifyPublicLiveToken(
  db: AnySupabase,
  token: string,
): Promise<PublicLiveSession | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const { data: row } = await db
    .from("public_live_access_codes")
    .select("id, label, instrument_id, session_expires_at, revoked_at, last_seen_at")
    .eq("session_token_hash", hash)
    .maybeSingle();
  if (!row || row.revoked_at || !row.session_expires_at) return null;
  if (new Date(row.session_expires_at).getTime() < Date.now()) return null;
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    await db
      .from("public_live_access_codes")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", row.id);
  }
  return {
    id: row.id,
    label: row.label ?? null,
    instrument_id: row.instrument_id ?? null,
    session_expires_at: row.session_expires_at,
  };
}

/* ---------------- snapshot ---------------- */

export interface PublicLiveChunk {
  units: string;
  dt: number;
  /** epoch seconds of values[0] */
  w0: number;
  values: number[];
}

export interface PublicLiveRow {
  sent_at: string;
  run_key: string | null;
  run_index: number | null;
  run_started_at: string | null;
  streams: Record<string, PublicLiveChunk>;
}

export interface PublicLiveInstrument {
  id: string;
  name: string;
  status: "offline" | "idle" | "running";
  /** the current injection's sample while running, else the last run's */
  sample_name: string | null;
  running: boolean;
}

export interface PublicLiveSnapshot {
  server_time: string;
  session_expires_at: string;
  instruments: PublicLiveInstrument[];
  /** the instrument the rows belong to */
  instrument_id: string | null;
  /** wavelength labels per detector signal, e.g. DAD1A -> "214 nm" */
  labels: Record<string, string>;
  rows: PublicLiveRow[];
  /** newest sent_at in rows; pass back as `since` */
  cursor: string | null;
}

const HISTORY_PAGE = 1000;
const HISTORY_MAX_ROWS = 4000;
const POLL_MAX_ROWS = 300;
const STALE_AFTER_MS = 90_000;

function liveStatus(
  s: { status?: string; last_batch_at?: string | null } | null,
): "offline" | "idle" | "running" {
  if (!s?.last_batch_at || Date.now() - new Date(s.last_batch_at).getTime() > STALE_AFTER_MS)
    return "offline";
  return s.status === "running" ? "running" : "idle";
}

export async function buildPublicLiveSnapshot(
  db: AnySupabase,
  session: PublicLiveSession,
  opts: { instrumentId: string | null; streams: string[]; since: string | null; history: boolean },
): Promise<PublicLiveSnapshot> {
  // ---- instruments the session may see ----
  let iq = db.from("instruments").select("id, name").eq("is_active", true).order("name");
  if (session.instrument_id) iq = iq.eq("id", session.instrument_id);
  const [{ data: instruments }, { data: statuses }] = await Promise.all([
    iq,
    db.from("instrument_live_status").select("instrument_id, status, last_batch_at"),
  ]);
  type StatusRow = { instrument_id: string; status: string; last_batch_at: string | null };
  const statusById = new Map<string, StatusRow>();
  for (const s of (statuses ?? []) as StatusRow[]) statusById.set(s.instrument_id, s);

  const out: PublicLiveInstrument[] = [];
  for (const inst of (instruments ?? []) as Array<{ id: string; name: string }>) {
    const status = liveStatus(statusById.get(inst.id) ?? null);
    const { data: run } = await db
      .from("instrument_runs")
      .select("sample_name, status")
      .eq("instrument_id", inst.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      id: inst.id,
      name: inst.name,
      status,
      sample_name: run?.sample_name ?? null,
      running: status === "running" && run?.status === "running",
    });
  }

  // ---- detector rows for the selected instrument ----
  const wanted =
    out.find((i) => i.id === opts.instrumentId)?.id ??
    out.find((i) => i.status === "running")?.id ??
    out[0]?.id ??
    null;
  const names = [...new Set(opts.streams.filter((n) => PUBLIC_STREAM_RE.test(n)))].slice(0, 8);
  const rows: PublicLiveRow[] = [];
  let labels: Record<string, string> = {};
  let cursor: string | null = null;
  if (wanted && names.length > 0) {
    const select = [
      "sent_at",
      "run_key",
      "run_index",
      "run_started_at",
      "labels",
      ...names.map((n, i) => `s${i}:streams->${n}`),
    ].join(",");
    const from = opts.since ?? new Date(Date.now() - LIVE_HISTORY_MINUTES * 60_000).toISOString();
    const max = opts.history ? HISTORY_MAX_ROWS : POLL_MAX_ROWS;
    for (let offset = 0; offset < max; offset += HISTORY_PAGE) {
      let q = db
        .from("instrument_live_batches")
        .select(select)
        .eq("instrument_id", wanted)
        .order("sent_at", { ascending: true })
        .range(offset, Math.min(offset + HISTORY_PAGE, max) - 1);
      q = opts.since ? q.gt("sent_at", from) : q.gte("sent_at", from);
      const { data: page, error } = await q;
      if (error) throw new Error(`live cache read failed: ${error.message}`);
      const got = (page ?? []) as Array<Record<string, unknown>>;
      for (const r of got) {
        const streams: Record<string, PublicLiveChunk> = {};
        names.forEach((n, i) => {
          const c = r[`s${i}`] as PublicLiveChunk | null;
          if (c && Array.isArray(c.values) && c.values.length > 0) streams[n] = c;
        });
        const rowLabels = r.labels as Record<string, string> | null;
        if (rowLabels && typeof rowLabels === "object") {
          for (const n of names) if (rowLabels[n]) labels = { ...labels, [n]: rowLabels[n] };
        }
        rows.push({
          sent_at: String(r.sent_at),
          run_key: (r.run_key as string | null) ?? null,
          run_index: (r.run_index as number | null) ?? null,
          run_started_at: (r.run_started_at as string | null) ?? null,
          streams,
        });
      }
      if (got.length < Math.min(HISTORY_PAGE, max - offset)) break;
    }
    cursor = rows.length ? rows[rows.length - 1].sent_at : (opts.since ?? null);
  }

  return {
    server_time: new Date().toISOString(),
    session_expires_at: session.session_expires_at,
    instruments: out,
    instrument_id: wanted,
    labels,
    rows,
    cursor,
  };
}

/**
 * Daily digest: one combined email per subscribed recipient, assembled
 * from up to six categories. Fired once a day by pg_cron (see
 * src/routes/api/cron/daily-digest.ts) at 7am PST.
 *
 * "Due" categories (Samples Due, Endotoxin, Heavy Metals) and the
 * sterility day3/day7/final-readout checkpoints deliberately recur every
 * day until the underlying work is actually done, rather than firing once
 * on an exact day -- a missed email must never mean a silently-missed
 * deadline. They naturally stop the moment the result exists (see each
 * fetch* function's "resolved" check). Only the one-shot "just received"
 * notices (Samples Received, and the day-after-receipt notice for
 * sterility/endotoxin) fire exactly once, since there's no "resolved"
 * concept for an FYI.
 *
 * Due Today is the unified urgent rollup -- every sample whose due_date
 * has arrived or passed, plus any sterility checkpoint due today or
 * later -- shown on its own (pink) in addition to appearing in its own
 * category section, so the most time-sensitive items are never buried.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/queue/scheduler.server";
import { sendEmail } from "./notifications.functions";
import {
  renderDigestEmailHtml, renderDigestTextFallback,
  type DigestItem, type DigestSection, type DigestTier,
} from "./daily-digest-template";

export type { DigestItem, DigestSection, DigestTier };

type SampleRow = {
  id: string; batch_id: string; client: string; project: string | null;
  compound: string | null; lot: string | null; due_date: string | null;
  receipt_date: string; status: string;
};

const SAMPLE_COLUMNS = "id, batch_id, client, project, compound, lot, due_date, receipt_date, status";
const TERMINAL_STATUSES = "(complete,approved,cancelled)";

function toItem(s: SampleRow, tier: DigestTier, note: string | null = null): DigestItem {
  return {
    sampleId: s.batch_id, client: s.client, project: s.project, compound: s.compound,
    lot: s.lot, dueDate: s.due_date, receiptDate: s.receipt_date, note, tier,
  };
}

async function samplesWithTestType(supabase: SupabaseClient, testType: string): Promise<string[]> {
  const { data } = await supabase.from("tests").select("sample_id").eq("test_type", testType);
  return Array.from(new Set((data ?? []).map((t) => t.sample_id as string)));
}

// ---------- Samples Received (green, one-shot) ----------
async function fetchSamplesReceived(supabase: SupabaseClient, today: string): Promise<DigestItem[]> {
  const yesterday = addDays(today, -1);
  const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS)
    .eq("receipt_date", yesterday).neq("status", "cancelled");
  return ((data ?? []) as SampleRow[]).map((s) => toItem(s, "new"));
}

// ---------- Samples Due (yellow, coming-up window only — today-or-overdue lives in Due Today) ----------
async function fetchSamplesDue(supabase: SupabaseClient, today: string): Promise<DigestItem[]> {
  const cutoff = addDays(today, 2);
  const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS)
    .gt("due_date", today).lte("due_date", cutoff).not("status", "in", TERMINAL_STATUSES);
  return ((data ?? []) as SampleRow[]).map((s) => toItem(s, "intermediate"));
}

// ---------- Due Today (pink) — every sample due today-or-earlier, general (covers all test types via the shared due_date column) ----------
async function fetchSamplesDueTodayOrOverdue(supabase: SupabaseClient, today: string): Promise<DigestItem[]> {
  const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS)
    .lte("due_date", today).not("status", "in", TERMINAL_STATUSES);
  return ((data ?? []) as SampleRow[]).map((s) => toItem(s, "due_today"));
}

// ---------- Endotoxin / Heavy Metals: receipt notice (green, one-shot) ----------
async function fetchTestTypeReceiptNotices(supabase: SupabaseClient, today: string, testType: string): Promise<DigestItem[]> {
  const yesterday = addDays(today, -1);
  const sampleIds = await samplesWithTestType(supabase, testType);
  if (!sampleIds.length) return [];
  const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS)
    .in("id", sampleIds).eq("receipt_date", yesterday).neq("status", "cancelled");
  return ((data ?? []) as SampleRow[]).map((s) => toItem(s, "new"));
}

/** sample_id -> test_id, for tests of this type whose test still has no nonchrom_results row. */
async function unresolvedTestIdsByType(
  supabase: SupabaseClient, testType: string, sampleIds: string[],
): Promise<Map<string, string>> {
  if (!sampleIds.length) return new Map();
  const { data: tests } = await supabase.from("tests").select("id, sample_id")
    .eq("test_type", testType).in("sample_id", sampleIds);
  const bySample = new Map((tests ?? []).map((t) => [t.sample_id as string, t.id as string]));
  const testIds = Array.from(bySample.values());
  if (!testIds.length) return new Map();
  const { data: results } = await supabase.from("nonchrom_results").select("test_id").in("test_id", testIds);
  const resulted = new Set((results ?? []).map((r) => r.test_id as string));
  const unresolved = new Map<string, string>();
  for (const [sampleId, testId] of bySample) if (!resulted.has(testId)) unresolved.set(sampleId, testId);
  return unresolved;
}

// ---------- Endotoxin / Heavy Metals: due-soon reminder (yellow, recurs until a nonchrom_results row exists) ----------
async function fetchTestTypeReminder(supabase: SupabaseClient, today: string, testType: string): Promise<DigestItem[]> {
  const cutoff = addDays(today, 2);
  const sampleIds = await samplesWithTestType(supabase, testType);
  if (!sampleIds.length) return [];
  const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS)
    .in("id", sampleIds).gt("due_date", today).lte("due_date", cutoff);
  const candidates = (data ?? []) as SampleRow[];
  if (!candidates.length) return [];
  const unresolved = await unresolvedTestIdsByType(supabase, testType, candidates.map((s) => s.id));
  return candidates.filter((s) => unresolved.has(s.id)).map((s) => toItem(s, "intermediate"));
}

// ---------- Sterility: receipt notice (green, one-shot) ----------
async function fetchSterilityReceiptNotices(supabase: SupabaseClient, today: string): Promise<DigestItem[]> {
  return fetchTestTypeReceiptNotices(supabase, today, "sterility");
}

// ---------- Sterility: day3/day7/final-readout checkpoints (pink — no advance-warning phase for these) ----------
async function fetchSterilityCheckpoints(supabase: SupabaseClient, today: string): Promise<DigestItem[]> {
  const { data: settings } = await supabase.from("sp_settings")
    .select("sterility_day3_check_day, sterility_day7_check_day, sterility_readout_day")
    .eq("id", true).maybeSingle();
  const day3Day = settings?.sterility_day3_check_day ?? 3;
  const day7Day = settings?.sterility_day7_check_day ?? 7;
  const readoutDay = settings?.sterility_readout_day ?? 14;
  const dayEndMs = new Date(`${today}T23:59:59.999Z`).getTime();
  const cutoffFor = (n: number) => new Date(dayEndMs - n * 86_400_000).toISOString();

  const items: DigestItem[] = [];
  const sampleCache = new Map<string, SampleRow>();
  async function loadSamples(ids: string[]) {
    const missing = ids.filter((id) => !sampleCache.has(id));
    if (!missing.length) return;
    const { data } = await supabase.from("samples").select(SAMPLE_COLUMNS).in("id", missing);
    for (const s of (data ?? []) as SampleRow[]) sampleCache.set(s.id, s);
  }

  async function checkpointPass(checkpoint: "day3" | "day7", cutoff: string, label: string) {
    const { data } = await supabase.from("analysis_batch_items")
      .select(`id, sample_id, ${checkpoint}_status, analysis_batches!inner(id, batch_number, incubation_started_at)`)
      .eq(`${checkpoint}_status`, "pending")
      .not("analysis_batches.incubation_started_at", "is", null)
      .lte("analysis_batches.incubation_started_at", cutoff);
    const rows = data ?? [];
    await loadSamples(rows.map((r) => r.sample_id as string));
    for (const row of rows) {
      const s = sampleCache.get(row.sample_id as string);
      const batch = row.analysis_batches as unknown as { batch_number: string };
      if (s) items.push(toItem(s, "due_today", `${label} — batch ${batch.batch_number}`));
    }
  }
  await checkpointPass("day3", cutoffFor(day3Day), "Day 3 check due");
  await checkpointPass("day7", cutoffFor(day7Day), "Day 7 check due");

  const { data: readoutBatches } = await supabase.from("analysis_batches")
    .select("id, batch_number, incubation_started_at")
    .eq("test_type", "sterility")
    .not("incubation_started_at", "is", null)
    .lte("incubation_started_at", cutoffFor(readoutDay));
  for (const batch of readoutBatches ?? []) {
    const { data: batchItems } = await supabase.from("analysis_batch_items")
      .select("test_id, sample_id").eq("batch_id", batch.id);
    const testIds = (batchItems ?? []).map((i) => i.test_id as string);
    if (!testIds.length) continue;
    const { data: results } = await supabase.from("nonchrom_results").select("test_id").in("test_id", testIds);
    const resulted = new Set((results ?? []).map((r) => r.test_id as string));
    const pending = (batchItems ?? []).filter((i) => !resulted.has(i.test_id as string));
    if (!pending.length) continue;
    await loadSamples(pending.map((i) => i.sample_id as string));
    for (const i of pending) {
      const s = sampleCache.get(i.sample_id as string);
      if (s) items.push(toItem(s, "due_today", `Final readout due — batch ${batch.batch_number}`));
    }
  }
  return items;
}

type DigestKey =
  | "digest_samples_received" | "digest_samples_due" | "digest_due_today"
  | "digest_sterility_readout" | "digest_endotoxin_due" | "digest_heavy_metals";

type RecipientRow = { id: string; name: string; email: string | null; is_active: boolean } & Record<DigestKey, boolean>;

export type DigestRunResult = {
  date: string;
  recipients: Array<{ email: string; name: string; sections: DigestSection[] }>;
  sent: number; skipped: number; failed: number;
};

export async function runDailyDigest(
  supabase: SupabaseClient,
  opts?: { dryRun?: boolean; only?: string },
): Promise<DigestRunResult> {
  const today = todayISO();
  // `only` sends to a single subscribed address. Verifying that mail
  // actually goes out otherwise means mailing the whole lab, which is not a
  // thing to do casually just to test a key.
  const onlyEmail = opts?.only?.trim().toLowerCase() || null;

  const [
    samplesReceived, samplesDue, dueTodayGeneral,
    sterilityReceipt, sterilityCheckpoints,
    endotoxinReceipt, endotoxinReminder,
    heavyMetalsReminder,
  ] = await Promise.all([
    fetchSamplesReceived(supabase, today),
    fetchSamplesDue(supabase, today),
    fetchSamplesDueTodayOrOverdue(supabase, today),
    fetchSterilityReceiptNotices(supabase, today),
    fetchSterilityCheckpoints(supabase, today),
    fetchTestTypeReceiptNotices(supabase, today, "endotoxin"),
    fetchTestTypeReminder(supabase, today, "endotoxin"),
    fetchTestTypeReminder(supabase, today, "heavy_metals"),
  ]);

  const categories: Array<{ key: DigestKey; title: string; items: DigestItem[] }> = [
    { key: "digest_due_today", title: "Due Today", items: [...dueTodayGeneral, ...sterilityCheckpoints] },
    { key: "digest_samples_received", title: "Samples Received", items: samplesReceived },
    { key: "digest_samples_due", title: "Samples Due", items: samplesDue },
    { key: "digest_sterility_readout", title: "Sterility Readout", items: [...sterilityReceipt, ...sterilityCheckpoints] },
    { key: "digest_endotoxin_due", title: "Endotoxin Due", items: [...endotoxinReceipt, ...endotoxinReminder] },
    { key: "digest_heavy_metals", title: "Heavy Metals", items: heavyMetalsReminder },
  ];

  const { data: recipientsRaw } = await supabase.from("notification_recipients")
    .select("id, name, email, is_active, digest_samples_received, digest_samples_due, digest_due_today, digest_sterility_readout, digest_endotoxin_due, digest_heavy_metals")
    .eq("is_active", true).not("email", "is", null);
  const recipients = ((recipientsRaw ?? []) as RecipientRow[])
    .filter((r) => !onlyEmail || (r.email ?? "").trim().toLowerCase() === onlyEmail);

  const result: DigestRunResult = { date: today, recipients: [], sent: 0, skipped: 0, failed: 0 };

  for (const r of recipients) {
    if (!r.email) continue;
    const sections = categories.filter((c) => r[c.key] && c.items.length > 0)
      .map((c) => ({ key: c.key, title: c.title, items: c.items }));
    if (sections.length === 0) { result.skipped++; continue; }

    result.recipients.push({ email: r.email, name: r.name, sections });
    if (opts?.dryRun) continue;

    try {
      const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
      const subject = `Daily Digest — ${today} (${totalItems} item${totalItems === 1 ? "" : "s"})`;
      const html = renderDigestEmailHtml(r.name, today, sections);
      const text = renderDigestTextFallback(sections);
      await sendEmail(r.email, subject, text, html);
      result.sent++;
    } catch (e) {
      console.error(`runDailyDigest: send failed for ${r.email}`, e);
      result.failed++;
    }
  }

  return result;
}

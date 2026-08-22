/**
 * Hourly watcher (see src/routes/api/cron/incubation-watcher.ts, scheduled
 * via pg_cron in the sterility_preps migration — the trigger function and
 * cron schedule are unchanged, only what this scans is new) that notifies
 * the lab when an analysis batch crosses its interim-check or readout
 * threshold. Dedups via interim_notified_at/readout_notified_at so a
 * threshold only ever fires one notification, not one every hour it stays
 * crossed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyIncubationReady } from "@/lib/notifications/notifications.functions";

export async function runIncubationWatcher(
  supabase: SupabaseClient,
): Promise<{ interimNotified: number; readoutNotified: number }> {
  const { data: settings } = await supabase
    .from("sp_settings").select("sterility_interim_check_day, sterility_readout_day").eq("id", true).maybeSingle();
  const interimDay = settings?.sterility_interim_check_day ?? 4;
  const readoutDay = settings?.sterility_readout_day ?? 14;
  const interimCutoff = new Date(Date.now() - interimDay * 86_400_000).toISOString();
  const readoutCutoff = new Date(Date.now() - readoutDay * 86_400_000).toISOString();

  let interimNotified = 0;
  let readoutNotified = 0;

  async function sampleCount(batchId: string): Promise<number> {
    const { count } = await supabase
      .from("analysis_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
    return count ?? 0;
  }

  // --- Interim check due ---
  const { data: interimDue } = await supabase
    .from("analysis_batches")
    .select("id, test_type, batch_number, incubation_started_at")
    .eq("interim_check_status", "pending")
    .is("interim_notified_at", null)
    .not("incubation_started_at", "is", null)
    .lte("incubation_started_at", interimCutoff);
  for (const row of interimDue ?? []) {
    const dayCount = Math.floor((Date.now() - new Date(row.incubation_started_at!).getTime()) / 86_400_000);
    await notifyIncubationReady(supabase, {
      kind: "interim_check", testType: row.test_type, batchNumber: row.batch_number,
      sampleCount: await sampleCount(row.id), dayCount,
    });
    await supabase.from("analysis_batches").update({ interim_notified_at: new Date().toISOString() }).eq("id", row.id);
    interimNotified++;
  }

  // --- Readout due (at least one item's test still has no nonchrom_results row) ---
  const { data: readoutCandidates } = await supabase
    .from("analysis_batches")
    .select("id, test_type, batch_number, incubation_started_at")
    .is("readout_notified_at", null)
    .not("incubation_started_at", "is", null)
    .lte("incubation_started_at", readoutCutoff);
  for (const row of readoutCandidates ?? []) {
    const { data: items } = await supabase.from("analysis_batch_items").select("test_id").eq("batch_id", row.id);
    const testIds = (items ?? []).map((i) => i.test_id);
    if (!testIds.length) continue;
    const { data: results } = await supabase.from("nonchrom_results").select("test_id").in("test_id", testIds);
    const resultedIds = new Set((results ?? []).map((r) => r.test_id));
    const stillPending = testIds.some((id) => !resultedIds.has(id));
    if (!stillPending) continue;

    const dayCount = Math.floor((Date.now() - new Date(row.incubation_started_at!).getTime()) / 86_400_000);
    await notifyIncubationReady(supabase, {
      kind: "readout", testType: row.test_type, batchNumber: row.batch_number,
      sampleCount: testIds.length, dayCount,
    });
    await supabase.from("analysis_batches").update({ readout_notified_at: new Date().toISOString() }).eq("id", row.id);
    readoutNotified++;
  }

  return { interimNotified, readoutNotified };
}

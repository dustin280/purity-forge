/**
 * Hourly watcher (see src/routes/api/cron/incubation-watcher.ts, scheduled
 * via pg_cron — the trigger function and cron schedule were defined in the
 * sterility_preps migration and are unchanged, only what this scans is
 * new) that notifies the lab when analysis batch items cross their day-3,
 * day-7, or day-14 (readout) threshold. Day 3/7 checks are per-sample
 * (analysis_batch_items) since growth can appear on one tube and not
 * another's — notifications are grouped per batch (one email per batch per
 * checkpoint, not one per sample) to avoid inbox spam. Dedups via each
 * item's day3_notified_at/day7_notified_at/readout_notified_at (batch-level
 * for readout, since the final result is already per-sample via
 * nonchrom_results) so a threshold only ever fires once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyIncubationReady } from "@/lib/notifications/notifications.functions";

type BatchRow = { id: string; test_type: string; batch_number: string; incubation_started_at: string | null };

export async function runIncubationWatcher(
  supabase: SupabaseClient,
): Promise<{ interimNotified: number; readoutNotified: number }> {
  const { data: settings } = await supabase
    .from("sp_settings")
    .select("sterility_day3_check_day, sterility_day7_check_day, sterility_readout_day")
    .eq("id", true).maybeSingle();
  const day3Day = settings?.sterility_day3_check_day ?? 3;
  const day7Day = settings?.sterility_day7_check_day ?? 7;
  const readoutDay = settings?.sterility_readout_day ?? 14;
  const day3Cutoff = new Date(Date.now() - day3Day * 86_400_000).toISOString();
  const day7Cutoff = new Date(Date.now() - day7Day * 86_400_000).toISOString();
  const readoutCutoff = new Date(Date.now() - readoutDay * 86_400_000).toISOString();

  let interimNotified = 0;
  let readoutNotified = 0;

  async function checkpointPass(checkpoint: "day3" | "day7", cutoff: string) {
    const { data: due } = await supabase
      .from("analysis_batch_items")
      .select(`id, batch_id, ${checkpoint}_status, analysis_batches!inner(id, test_type, batch_number, incubation_started_at)`)
      .eq(`${checkpoint}_status`, "pending")
      .is(`${checkpoint}_notified_at`, null)
      .not("analysis_batches.incubation_started_at", "is", null)
      .lte("analysis_batches.incubation_started_at", cutoff);
    if (!due?.length) return;

    const byBatch = new Map<string, { batch: BatchRow; itemIds: string[] }>();
    for (const row of due) {
      const batch = row.analysis_batches as unknown as BatchRow;
      const entry = byBatch.get(row.batch_id) ?? { batch, itemIds: [] };
      entry.itemIds.push(row.id);
      byBatch.set(row.batch_id, entry);
    }

    for (const { batch, itemIds } of byBatch.values()) {
      const dayCount = Math.floor((Date.now() - new Date(batch.incubation_started_at!).getTime()) / 86_400_000);
      await notifyIncubationReady(supabase, {
        kind: checkpoint === "day3" ? "day3_check" : "day7_check", testType: batch.test_type, batchNumber: batch.batch_number,
        sampleCount: itemIds.length, dayCount,
      });
      await supabase.from("analysis_batch_items").update({ [`${checkpoint}_notified_at`]: new Date().toISOString() }).in("id", itemIds);
      interimNotified++;
    }
  }

  await checkpointPass("day3", day3Cutoff);
  await checkpointPass("day7", day7Cutoff);

  // --- Readout due (batch-level dedup; at least one item's test still has no nonchrom_results row) ---
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

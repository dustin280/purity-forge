/**
 * Hourly watcher (see src/routes/api/cron/incubation-watcher.ts, scheduled
 * via pg_cron in the sterility_preps migration) that notifies the lab when
 * a sterility prep crosses its interim-check or readout threshold.
 * Dedups via interim_notified_at/readout_notified_at so a threshold only
 * ever fires one notification, not one every hour it stays crossed.
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

  // --- Interim check due ---
  const { data: interimDue } = await supabase
    .from("sterility_preps")
    .select("id, test_id, prepared_at, samples(batch_id)")
    .eq("interim_check_status", "pending")
    .is("interim_notified_at", null)
    .lte("prepared_at", interimCutoff);
  for (const row of interimDue ?? []) {
    const batchId = (row.samples as unknown as { batch_id: string } | null)?.batch_id ?? row.test_id;
    const dayCount = Math.floor((Date.now() - new Date(row.prepared_at).getTime()) / 86_400_000);
    await notifyIncubationReady(supabase, { kind: "interim_check", batchId, dayCount });
    await supabase.from("sterility_preps").update({ interim_notified_at: new Date().toISOString() }).eq("id", row.id);
    interimNotified++;
  }

  // --- Readout due (no nonchrom_results row for the test yet) ---
  const { data: readoutCandidates } = await supabase
    .from("sterility_preps")
    .select("id, test_id, prepared_at, samples(batch_id)")
    .is("readout_notified_at", null)
    .lte("prepared_at", readoutCutoff);
  const candidateTestIds = (readoutCandidates ?? []).map((r) => r.test_id);
  const resultedTestIds = candidateTestIds.length
    ? new Set(
        (
          await supabase.from("nonchrom_results").select("test_id").in("test_id", candidateTestIds)
        ).data?.map((r) => r.test_id) ?? [],
      )
    : new Set<string>();
  for (const row of readoutCandidates ?? []) {
    if (resultedTestIds.has(row.test_id)) continue;
    const batchId = (row.samples as unknown as { batch_id: string } | null)?.batch_id ?? row.test_id;
    const dayCount = Math.floor((Date.now() - new Date(row.prepared_at).getTime()) / 86_400_000);
    await notifyIncubationReady(supabase, { kind: "readout", batchId, dayCount });
    await supabase.from("sterility_preps").update({ readout_notified_at: new Date().toISOString() }).eq("id", row.id);
    readoutNotified++;
  }

  return { interimNotified, readoutNotified };
}

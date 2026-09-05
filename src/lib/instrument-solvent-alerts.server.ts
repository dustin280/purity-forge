/**
 * Low-solvent alerts, evaluated by the feed route whenever the agent reports
 * bottle levels (once a minute with the pressure log, every heartbeat while
 * idle). One open row per instrument and bottle while it sits below the
 * instrument's threshold; subscribed notification recipients get an email
 * and/or SMS when it opens, and it clears itself once the bottle is back
 * above the threshold plus a margin (a refill), ready to fire again next time.
 */
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import type { InstrumentSolvents } from "@/lib/instrument-feed.server";
import { notifySolventLow } from "@/lib/notifications/notifications.functions";

export const DEFAULT_SOLVENT_ALERT_PCT = 20;
/** an open alert clears once the bottle is this far above the threshold */
export const SOLVENT_ALERT_CLEAR_MARGIN_PCT = 5;

export async function checkSolventAlerts(
  db: AnySupabase,
  instrumentId: string,
  solvents: InstrumentSolvents,
): Promise<void> {
  try {
    const [{ data: inst }, { data: open }] = await Promise.all([
      db.from("instruments").select("name, solvent_alert_pct").eq("id", instrumentId).maybeSingle(),
      db
        .from("instrument_solvent_alerts")
        .select("id, bottle_key")
        .eq("instrument_id", instrumentId)
        .is("cleared_at", null),
    ]);
    const threshold = Number(inst?.solvent_alert_pct ?? DEFAULT_SOLVENT_ALERT_PCT);
    const openByKey = new Map<string, string>(
      ((open ?? []) as Array<{ id: string; bottle_key: string }>).map((a) => [a.bottle_key, a.id]),
    );
    const now = new Date().toISOString();
    for (const b of solvents.bottles) {
      if (!b.configured || b.pct == null) continue;
      const openId = openByKey.get(b.key);
      if (b.pct < threshold && !openId) {
        const { data: row, error } = await db
          .from("instrument_solvent_alerts")
          .insert({
            instrument_id: instrumentId,
            bottle_key: b.key,
            bottle_name: b.name,
            threshold_pct: threshold,
            pct: b.pct,
            remaining_ml: b.remaining_ml,
            capacity_ml: b.capacity_ml,
            triggered_at: now,
          })
          .select("id")
          .single();
        if (error) throw new Error(`instrument_solvent_alerts insert failed: ${error.message}`);
        const result = await notifySolventLow(db, {
          instrumentName: inst?.name ?? "Instrument",
          bottle: b.name,
          pct: b.pct,
          remainingMl: b.remaining_ml,
          capacityMl: b.capacity_ml,
          thresholdPct: threshold,
          clearPct: threshold + SOLVENT_ALERT_CLEAR_MARGIN_PCT,
          test: false,
        });
        await db
          .from("instrument_solvent_alerts")
          .update({ notified_at: new Date().toISOString(), notify_result: result })
          .eq("id", row.id);
      } else if (openId && b.pct >= threshold + SOLVENT_ALERT_CLEAR_MARGIN_PCT) {
        await db
          .from("instrument_solvent_alerts")
          .update({ cleared_at: now, cleared_pct: b.pct })
          .eq("id", openId);
      }
    }
  } catch (e) {
    // Alerts must never fail the feed itself.
    console.error("[solvent-alerts]", e);
  }
}

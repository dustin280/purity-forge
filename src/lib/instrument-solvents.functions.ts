/**
 * Live Instruments → solvent levels & low-solvent alerts: the threshold per
 * instrument, which notification recipients are subscribed, the alert
 * history, and a test send. Reads use the caller's RLS client; writes are
 * admin-only (instruments / notification_recipients admin policies, checked
 * here too so the error is a clear one).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import { notifySolventLow } from "@/lib/notifications/notifications.functions";
import {
  DEFAULT_SOLVENT_ALERT_PCT,
  SOLVENT_ALERT_CLEAR_MARGIN_PCT,
} from "@/lib/instrument-solvent-alerts.server";

export interface SolventAlertRecipient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notify_email: boolean;
  notify_sms: boolean;
  is_active: boolean;
  alert_solvent_low: boolean;
}

export interface SolventAlertRow {
  id: string;
  bottle_key: string;
  bottle_name: string;
  threshold_pct: number;
  pct: number;
  remaining_ml: number | null;
  capacity_ml: number | null;
  triggered_at: string;
  notified_at: string | null;
  notify_result: { emails: number; sms: number; failures: string[] } | null;
  cleared_at: string | null;
  cleared_pct: number | null;
}

export interface SolventAlertSettings {
  threshold_pct: number;
  clear_margin_pct: number;
  recipients: SolventAlertRecipient[];
  alerts: SolventAlertRow[];
}

async function assertAdmin(db: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Failed to verify role");
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getSolventAlertSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instrument_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<SolventAlertSettings> => {
    const db = context.supabase as AnySupabase;
    const [{ data: inst }, { data: recipients, error: rErr }, { data: alerts, error: aErr }] =
      await Promise.all([
        db
          .from("instruments")
          .select("solvent_alert_pct")
          .eq("id", data.instrument_id)
          .maybeSingle(),
        db
          .from("notification_recipients")
          .select("id, name, email, phone, notify_email, notify_sms, is_active, alert_solvent_low")
          .order("name"),
        db
          .from("instrument_solvent_alerts")
          .select(
            "id, bottle_key, bottle_name, threshold_pct, pct, remaining_ml, capacity_ml, triggered_at, notified_at, notify_result, cleared_at, cleared_pct",
          )
          .eq("instrument_id", data.instrument_id)
          .order("triggered_at", { ascending: false })
          .limit(20),
      ]);
    if (rErr) throw rErr;
    if (aErr) throw aErr;
    return {
      threshold_pct: Number(inst?.solvent_alert_pct ?? DEFAULT_SOLVENT_ALERT_PCT),
      clear_margin_pct: SOLVENT_ALERT_CLEAR_MARGIN_PCT,
      recipients: (recipients ?? []) as SolventAlertRecipient[],
      alerts: ((alerts ?? []) as SolventAlertRow[]).map((a) => ({
        ...a,
        pct: Number(a.pct),
        remaining_ml: a.remaining_ml == null ? null : Number(a.remaining_ml),
        capacity_ml: a.capacity_ml == null ? null : Number(a.capacity_ml),
        cleared_pct: a.cleared_pct == null ? null : Number(a.cleared_pct),
      })),
    };
  });

export const updateSolventAlertThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ instrument_id: z.string().uuid(), threshold_pct: z.number().int().min(1).max(90) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { error } = await db
      .from("instruments")
      .update({ solvent_alert_pct: data.threshold_pct })
      .eq("id", data.instrument_id);
    if (error) throw error;
    return { ok: true };
  });

export const setRecipientSolventAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), on: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { error } = await db
      .from("notification_recipients")
      .update({ alert_solvent_low: data.on })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Sends a clearly marked test message to every subscribed recipient, so the channels can be checked. */
export const sendSolventTestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instrument_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = context.supabase as AnySupabase;
    await assertAdmin(db, context.userId);
    const { data: inst } = await db
      .from("instruments")
      .select("name, solvent_alert_pct")
      .eq("id", data.instrument_id)
      .maybeSingle();
    const threshold = Number(inst?.solvent_alert_pct ?? DEFAULT_SOLVENT_ALERT_PCT);
    return notifySolventLow(db, {
      instrumentName: inst?.name ?? "Instrument",
      bottle: "B1",
      pct: Math.max(0, threshold - 2),
      remainingMl: null,
      capacityMl: null,
      thresholdPct: threshold,
      clearPct: threshold + SOLVENT_ALERT_CLEAR_MARGIN_PCT,
      test: true,
    });
  });

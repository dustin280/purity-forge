/**
 * New-sample-intake email/SMS alerts to a fixed lab distribution list, plus
 * the CRUD server fns backing the admin recipients UI.
 *
 * Send calls go through Lovable's connector-gateway, same shared-credential
 * pattern already used for Google Drive elsewhere in this codebase (see
 * src/lib/openlab-drive.functions.ts). Resend and Twilio aren't connected
 * on this project yet (checked in Lovable's Connectors panel), so the
 * request shapes below are a best-effort match to Resend's/Twilio's public
 * REST APIs through that same gateway — NOT yet verified against a live
 * send. Once both connectors are linked in Lovable, confirm/correct these
 * two request shapes (marked below) via Lovable's chat before relying on
 * this in production.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Recipients CRUD (admin UI) ----------

export const listNotificationRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_recipients").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createNotificationRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(128).trim(),
      email: z.string().email().max(255).optional().nullable(),
      phone: z.string().min(7).max(32).optional().nullable(),
      notify_email: z.boolean().optional().default(true),
      notify_sms: z.boolean().optional().default(true),
    }).refine(d => d.email || d.phone, { message: "Provide an email, a phone number, or both" }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("notification_recipients")
      .insert({
        name: data.name, email: data.email ?? null, phone: data.phone ?? null,
        notify_email: data.notify_email, notify_sms: data.notify_sms,
      })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateNotificationRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(128).trim().optional(),
      email: z.string().email().max(255).optional().nullable(),
      phone: z.string().min(7).max(32).optional().nullable(),
      notify_email: z.boolean().optional(),
      notify_sms: z.boolean().optional(),
      is_active: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("notification_recipients").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteNotificationRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("notification_recipients").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Send (internal, not a createServerFn — called from coc-intake.functions.ts) ----------

const GATEWAY_RESEND = "https://connector-gateway.lovable.dev/resend";
const GATEWAY_TWILIO = "https://connector-gateway.lovable.dev/twilio";

// The "from" identity for each channel: Resend requires a domain verified
// in the connected Resend account; Twilio requires a number provisioned in
// the connected Twilio account. Placeholders — confirm/replace once
// connected (see Verification in the plan).
const EMAIL_FROM = "Synthesyx Lab Manager <notifications@syxlab.org>";
const SMS_FROM = process.env.TWILIO_FROM_NUMBER ?? "";

function resendHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const rk = process.env.RESEND_API_KEY;
  if (!lk || !rk) throw new Error("Resend is not connected. Link the Resend connector in Project Settings.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": rk, "Content-Type": "application/json" };
}

function twilioHeaders(): Record<string, string> {
  const lk = process.env.LOVABLE_API_KEY;
  const tk = process.env.TWILIO_API_KEY;
  if (!lk || !tk) throw new Error("Twilio is not connected. Link the Twilio connector in Project Settings.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": tk, "Content-Type": "application/x-www-form-urlencoded" };
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  // UNVERIFIED — matches Resend's public `POST /emails` shape; confirm via
  // Lovable once the connector is connected.
  const r = await fetch(`${GATEWAY_RESEND}/emails`, {
    method: "POST",
    headers: resendHeaders(),
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
  });
  if (!r.ok) throw new Error(`Resend send failed (${r.status}): ${await r.text()}`);
}

async function sendSms(to: string, body: string): Promise<void> {
  // UNVERIFIED — matches Twilio's public Messages resource shape (form-
  // encoded To/From/Body); confirm via Lovable once the connector is
  // connected, including whether the gateway needs an Account SID in the
  // path or injects it server-side.
  const r = await fetch(`${GATEWAY_TWILIO}/Messages.json`, {
    method: "POST",
    headers: twilioHeaders(),
    body: new URLSearchParams({ To: to, From: SMS_FROM, Body: body }),
  });
  if (!r.ok) throw new Error(`Twilio send failed (${r.status}): ${await r.text()}`);
}

export type NewIntakeSummary = {
  client: string;
  project: string | null;
  sampleId: string;
  sampleCount: number;
  compounds: string[];
};

/**
 * Fires one email + one SMS per active recipient summarizing a just-
 * submitted Sample Receipt batch. Never throws — a notification failure
 * (or the connectors simply not being linked yet) must never fail the
 * intake submission itself; failures are logged server-side only.
 */
export async function notifyNewIntake(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  summary: NewIntakeSummary,
): Promise<void> {
  try {
    const { data: recipients, error } = await supabase
      .from("notification_recipients")
      .select("name, email, phone, notify_email, notify_sms")
      .eq("is_active", true);
    if (error) throw error;
    if (!recipients || recipients.length === 0) return;

    const compoundList = summary.compounds.length ? summary.compounds.join(", ") : "—";
    const subject = `New sample intake — ${summary.sampleId} (${summary.client})`;
    const emailBody = [
      `${summary.sampleCount} sample${summary.sampleCount === 1 ? "" : "s"} received from ${summary.client}${summary.project ? ` (${summary.project})` : ""}.`,
      `Sample ID: ${summary.sampleId}`,
      `Compounds: ${compoundList}`,
      `View: https://syxlab.org/chain-of-custody`,
    ].join("\n");
    const smsBody = `New intake: ${summary.sampleCount} sample${summary.sampleCount === 1 ? "" : "s"} from ${summary.client} (${summary.sampleId}). syxlab.org`;

    const sends = recipients.flatMap((r) => {
      const jobs: Promise<void>[] = [];
      if (r.notify_email && r.email) jobs.push(sendEmail(r.email, subject, emailBody));
      if (r.notify_sms && r.phone) jobs.push(sendSms(r.phone, smsBody));
      return jobs;
    });
    const results = await Promise.allSettled(sends);
    for (const res of results) {
      if (res.status === "rejected") console.error("notifyNewIntake: send failed", res.reason);
    }
  } catch (e) {
    console.error("notifyNewIntake failed", e);
  }
}

export type IncubationAlertSummary = {
  kind: "day3_check" | "day7_check" | "readout";
  testType: string;
  batchNumber: string;
  sampleCount: number;
  dayCount: number;
};

/**
 * Fired by the incubation watcher (src/lib/lims/incubation-watcher.functions.ts)
 * when an analysis batch crosses its interim-check or readout threshold.
 * Same send shape as notifyNewIntake — never throws, logs failures only.
 */
export async function notifyIncubationReady(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  summary: IncubationAlertSummary,
): Promise<void> {
  try {
    const { data: recipients, error } = await supabase
      .from("notification_recipients")
      .select("name, email, phone, notify_email, notify_sms")
      .eq("is_active", true);
    if (error) throw error;
    if (!recipients || recipients.length === 0) return;

    const label = summary.kind === "day3_check" ? "Day 3 check" : summary.kind === "day7_check" ? "Day 7 check" : "readout";
    const subject = `${summary.testType} ${label} ready — ${summary.batchNumber}`;
    const emailBody = [
      `Batch ${summary.batchNumber} (${summary.sampleCount} sample${summary.sampleCount === 1 ? "" : "s"}) is ready for its ${label} (day ${summary.dayCount} of incubation).`,
      `View: https://syxlab.org/lab-logs/analysis-batches`,
    ].join("\n");
    const smsBody = `${summary.testType} ${label} ready: ${summary.batchNumber}, ${summary.sampleCount} sample${summary.sampleCount === 1 ? "" : "s"} (day ${summary.dayCount}). syxlab.org`;

    const sends = recipients.flatMap((r) => {
      const jobs: Promise<void>[] = [];
      if (r.notify_email && r.email) jobs.push(sendEmail(r.email, subject, emailBody));
      if (r.notify_sms && r.phone) jobs.push(sendSms(r.phone, smsBody));
      return jobs;
    });
    const results = await Promise.allSettled(sends);
    for (const res of results) {
      if (res.status === "rejected") console.error("notifyIncubationReady: send failed", res.reason);
    }
  } catch (e) {
    console.error("notifyIncubationReady failed", e);
  }
}

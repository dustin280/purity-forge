/**
 * Server functions for the analysis queue: overview, capacity check,
 * auto-scheduling, reassignment, and config read/write.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTIVE_SAMPLE_STATUSES } from "@/lib/lims-utils";
import { releaseSampleFromInstrument } from "@/lib/run-lists/vial-release.functions";
import {
  simulate,
  computeHealth,
  findNextAcceptDate,
  todayISO,
  addDays,
  type SchedulerConfig,
  type SchedulerInputSample,
  type PerDaySlot,
} from "@/lib/queue/scheduler.server";

type SupabaseCtx = { supabase: import("@supabase/supabase-js").SupabaseClient };

async function loadConfig(ctx: SupabaseCtx): Promise<SchedulerConfig> {
  const { data, error } = await ctx.supabase
    .from("queue_config")
    .select("daily_capacity, tat_days, business_days_only, approaching_threshold_pct")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    daily_capacity: data?.daily_capacity ?? 20,
    tat_days: data?.tat_days ?? 5,
    business_days_only: data?.business_days_only ?? false,
    approaching_threshold_pct: data?.approaching_threshold_pct ?? 80,
  };
}

async function loadOpenSamples(ctx: SupabaseCtx): Promise<SchedulerInputSample[]> {
  const { data, error } = await ctx.supabase
    .from("samples")
    .select("id, receipt_date, due_date, assigned_analysis_date, priority, status")
    .in("status", ACTIVE_SAMPLE_STATUSES as unknown as string[])
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    receipt_date: ((r.receipt_date as string) ?? todayISO()).slice(0, 10),
    due_date: ((r.due_date as string) ?? todayISO()).slice(0, 10),
    assigned_analysis_date: (r.assigned_analysis_date as string | null) ?? null,
    priority: (r.priority as number) ?? 0,
  }));
}

export type QueueSampleRow = {
  id: string;
  batch_id: string;
  client: string;
  project: string | null;
  compound: string | null;
  receipt_date: string;
  due_date: string;
  status: string;
  assigned_analysis_date: string | null;
  priority?: number;
};

export const getQueueOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const config = await loadConfig(context);
    const today = todayISO();
    const openSamples = await loadOpenSamples(context);
    const result = simulate(openSamples, config, today, 14);
    const health = computeHealth(result.per_day, config, result.unassignable.length > 0);
    const nextAccept = findNextAcceptDate(result.per_day, today, config.tat_days);

    const first7 = result.per_day.slice(0, 7);
    const allIds = first7.flatMap((d) => d.sample_ids);
    let sampleMap = new Map<string, QueueSampleRow>();
    if (allIds.length > 0) {
      const { data: rows, error } = await context.supabase
        .from("samples")
        .select("id, batch_id, client, project, compound, receipt_date, due_date, status, assigned_analysis_date, priority")
        .in("id", allIds);
      if (error) throw error;
      sampleMap = new Map((rows ?? []).map((r) => [r.id as string, r as unknown as QueueSampleRow]));
    }

    const scheduleByDay = first7.map((d) => ({
      ...d,
      samples: d.sample_ids
        .map((id) => sampleMap.get(id))
        .filter((v): v is QueueSampleRow => Boolean(v)),
    }));

    const dueSoonCutoff = addDays(today, 2);
    const atRiskIds = new Set<string>(result.unassignable);
    for (const s of openSamples) {
      if (s.due_date <= dueSoonCutoff) atRiskIds.add(s.id);
    }
    let atRisk: QueueSampleRow[] = [];
    if (atRiskIds.size > 0) {
      const { data: rows } = await context.supabase
        .from("samples")
        .select("id, batch_id, client, project, compound, receipt_date, due_date, status, assigned_analysis_date")
        .in("id", [...atRiskIds]);
      atRisk = (rows ?? []) as unknown as QueueSampleRow[];
    }

    const assignedIds = new Set(result.assignments.map((a) => a.sample_id));
    const backlogIds = openSamples
      .filter((s) => s.due_date < today || !assignedIds.has(s.id))
      .map((s) => s.id);
    let backlog: QueueSampleRow[] = [];
    if (backlogIds.length > 0) {
      const { data: rows } = await context.supabase
        .from("samples")
        .select("id, batch_id, client, project, compound, receipt_date, due_date, status, assigned_analysis_date")
        .in("id", backlogIds);
      backlog = (rows ?? []) as unknown as QueueSampleRow[];
    }

    const todaySlot = result.per_day[0];
    const leadTimeDate = nextAccept;
    const leadTimeDays = leadTimeDate
      ? Math.max(0, Math.round((new Date(leadTimeDate).getTime() - new Date(today).getTime()) / 86400000))
      : null;

    return {
      today,
      config,
      health,
      next_accept_date: nextAccept,
      lead_time_days: leadTimeDays,
      slots_today: todaySlot ? todaySlot.available : 0,
      capacity_today: todaySlot ? todaySlot.capacity : 0,
      booked_today: todaySlot ? todaySlot.booked : 0,
      at_risk_count: atRisk.length,
      unassignable_count: result.unassignable.length,
      per_day: scheduleByDay,
      at_risk: atRisk,
      backlog,
    };
  });

const checkInput = z.object({
  receipt_date: z.string().min(10).max(10).optional(),
  count: z.number().int().min(1).max(100).optional().default(1),
});

export const checkNewSampleCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkInput.parse(d))
  .handler(async ({ context, data }) => {
    const config = await loadConfig(context);
    const today = todayISO();
    const receiptDate = data.receipt_date ?? today;
    const openSamples = await loadOpenSamples(context);
    const hypothetical: SchedulerInputSample[] = Array.from({ length: data.count }, (_, i) => ({
      id: `__hypo_${i}`,
      receipt_date: receiptDate,
      due_date: addDays(receiptDate, config.tat_days),
      assigned_analysis_date: null,
      priority: -1,
    }));
    const result = simulate([...openSamples, ...hypothetical], config, today, 14);
    const hypoAssignments = result.assignments.filter((a) => a.sample_id.startsWith("__hypo_"));
    const canAccept = hypoAssignments.length === data.count;
    const suggested = hypoAssignments[0]?.date ?? null;
    return {
      can_accept: canAccept,
      suggested_date: suggested,
      receipt_date: receiptDate,
      per_day: result.per_day.slice(0, 10),
      lead_time_days: suggested
        ? Math.max(0, Math.round((new Date(suggested).getTime() - new Date(today).getTime()) / 86400000))
        : null,
    };
  });

const autoInput = z.object({
  dry_run: z.boolean().optional().default(true),
});

export const autoSchedulePending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => autoInput.parse(d))
  .handler(async ({ context, data }) => {
    const config = await loadConfig(context);
    const today = todayISO();
    const openSamples = await loadOpenSamples(context);
    const result = simulate(openSamples, config, today, 21);

    const currentById = new Map(openSamples.map((s) => [s.id, s]));
    const changes = result.assignments
      .filter((a) => currentById.get(a.sample_id)?.assigned_analysis_date !== a.date)
      .map((a) => ({
        sample_id: a.sample_id,
        from: currentById.get(a.sample_id)?.assigned_analysis_date ?? null,
        to: a.date,
      }));

    if (data.dry_run) {
      return { dry_run: true, changes, unassignable: result.unassignable };
    }

    for (const c of changes) {
      const { error } = await context.supabase
        .from("samples")
        .update({ assigned_analysis_date: c.to })
        .eq("id", c.sample_id);
      if (error) throw error;
    }
    const scheduledIds = changes.map((c) => c.sample_id);
    if (scheduledIds.length > 0) {
      await context.supabase
        .from("samples")
        .update({ status: "scheduled" })
        .in("id", scheduledIds)
        .in("status", ["received", "intake_verified"]);
    }
    return { dry_run: false, applied: changes.length, unassignable: result.unassignable };
  });

export const reassignSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().uuid(),
      date: z.string().min(10).max(10),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: sample, error } = await context.supabase
      .from("samples")
      .select("id, due_date, receipt_date")
      .eq("id", data.sample_id)
      .maybeSingle();
    if (error) throw error;
    if (!sample) throw new Error("Sample not found");
    if (data.date > (sample.due_date as string)) {
      throw new Error(`Cannot schedule past due date (${sample.due_date})`);
    }
    const { error: uerr } = await context.supabase
      .from("samples")
      .update({ assigned_analysis_date: data.date, status: "scheduled" })
      .eq("id", data.sample_id);
    if (uerr) throw uerr;
    return { ok: true };
  });

export const setSampleQueueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().uuid(),
      status: z.enum([
        "received", "intake_verified", "scheduled", "prep",
        "in_progress", "in_analysis", "on_hold", "reviewed",
        "complete", "approved", "cancelled",
      ]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: { status: typeof data.status; actual_completion_date?: string } = { status: data.status };
    if (data.status === "complete" || data.status === "approved") {
      patch.actual_completion_date = todayISO();
    }
    const { error } = await context.supabase
      .from("samples")
      .update(patch)
      .eq("id", data.sample_id);
    if (error) throw error;
    if (data.status === "complete" || data.status === "approved") {
      await releaseSampleFromInstrument(context.supabase, data.sample_id);
    }
    return { ok: true };
  });

export const getQueueConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return loadConfig(context);
  });

const configInput = z.object({
  daily_capacity: z.number().int().min(1).max(1000),
  tat_days: z.number().int().min(1).max(60),
  business_days_only: z.boolean(),
  approaching_threshold_pct: z.number().int().min(1).max(100),
});

export const updateQueueConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => configInput.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("queue_config")
      .update(data)
      .eq("id", true);
    if (error) throw error;
    return { ok: true };
  });

export type QueueOverviewPerDay = PerDaySlot & { samples: unknown[] };
const QUEUE_STATUSES = [
  "received", "intake_verified", "scheduled", "prep",
  "in_progress", "in_analysis", "on_hold", "reviewed",
  "complete", "approved", "cancelled",
] as const;

/** Flag many samples at once with a new queue state (used by the queue multi-select). */
export const bulkSetSampleQueueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_ids: z.array(z.string().uuid()).min(1).max(500),
      status: z.enum(QUEUE_STATUSES),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: { status: typeof data.status; actual_completion_date?: string } = { status: data.status };
    if (data.status === "complete" || data.status === "approved") {
      patch.actual_completion_date = todayISO();
    }
    const { error } = await context.supabase
      .from("samples")
      .update(patch)
      .in("id", data.sample_ids);
    if (error) throw error;
    if (data.status === "complete" || data.status === "approved") {
      await Promise.all(data.sample_ids.map((id) => releaseSampleFromInstrument(context.supabase, id)));
    }
    return { ok: true, updated: data.sample_ids.length };
  });

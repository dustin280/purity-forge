/**
 * Pure earliest-deadline-first analysis scheduler. No I/O — takes samples +
 * config, returns a per-day plan and any samples that cannot meet TAT.
 */

export type SchedulerConfig = {
  daily_capacity: number;
  tat_days: number;
  business_days_only: boolean;
  approaching_threshold_pct: number;
};

export type SchedulerInputSample = {
  id: string;
  receipt_date: string;
  due_date: string;
  assigned_analysis_date: string | null;
  priority: number;
};

export type PerDaySlot = {
  date: string;
  weekday: number;
  is_business_day: boolean;
  capacity: number;
  booked: number;
  available: number;
  sample_ids: string[];
};

export type SchedulerAssignment = { sample_id: string; date: string };

export type SchedulerResult = {
  per_day: PerDaySlot[];
  assignments: SchedulerAssignment[];
  unassignable: string[];
};

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function isBusinessDay(iso: string): boolean {
  const w = parseISODate(iso).getUTCDay();
  return w !== 0 && w !== 6;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function dateRange(start: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(start, i));
  return out;
}

export function simulate(
  samples: SchedulerInputSample[],
  config: SchedulerConfig,
  today: string,
  horizonDays: number = 21,
): SchedulerResult {
  const queue = [...samples].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
    return a.receipt_date < b.receipt_date ? -1 : 1;
  });

  const latestDue = queue.reduce<string>((m, s) => (s.due_date > m ? s.due_date : m), today);
  const spanDays = Math.max(
    horizonDays,
    Math.ceil((parseISODate(latestDue).getTime() - parseISODate(today).getTime()) / 86400000) + 2,
  );

  const days: PerDaySlot[] = dateRange(today, spanDays).map((date) => {
    const biz = isBusinessDay(date);
    const cap = !config.business_days_only || biz ? config.daily_capacity : 0;
    return {
      date,
      weekday: parseISODate(date).getUTCDay(),
      is_business_day: biz,
      capacity: cap,
      booked: 0,
      available: cap,
      sample_ids: [],
    };
  });

  const assignments: SchedulerAssignment[] = [];
  const unassignable: string[] = [];

  for (const s of queue) {
    const startFrom = s.receipt_date > today ? s.receipt_date : today;
    let placed = false;
    for (const day of days) {
      if (day.date < startFrom) continue;
      if (day.date > s.due_date) break;
      if (day.capacity <= 0) continue;
      if (day.booked >= day.capacity) continue;
      day.booked += 1;
      day.available = day.capacity - day.booked;
      day.sample_ids.push(s.id);
      assignments.push({ sample_id: s.id, date: day.date });
      placed = true;
      break;
    }
    if (!placed) unassignable.push(s.id);
  }

  return { per_day: days, assignments, unassignable };
}

export type QueueHealth = "healthy" | "approaching" | "full";

export function computeHealth(
  per_day: PerDaySlot[],
  config: SchedulerConfig,
  hasUnassignable: boolean,
): QueueHealth {
  if (hasUnassignable) return "full";
  const window = per_day.slice(0, 5);
  const today = window[0];
  if (today && today.capacity > 0 && today.available <= 0) {
    const allFull = window.every((d) => d.capacity === 0 || d.available <= 0);
    if (allFull) return "full";
  }
  const pct = window.reduce((acc, d) => {
    if (d.capacity === 0) return acc;
    return Math.max(acc, Math.round((d.booked / d.capacity) * 100));
  }, 0);
  if (pct >= 100) return "full";
  if (pct >= config.approaching_threshold_pct) return "approaching";
  return "healthy";
}

export function findNextAcceptDate(
  per_day: PerDaySlot[],
  receiptISO: string,
  tatDays: number,
): string | null {
  const deadline = addDays(receiptISO, tatDays);
  for (const day of per_day) {
    if (day.date < receiptISO) continue;
    if (day.date > deadline) return null;
    if (day.capacity <= 0) continue;
    if (day.available > 0) return day.date;
  }
  return null;
}
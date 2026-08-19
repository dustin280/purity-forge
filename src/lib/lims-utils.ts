/**
 * Pure utility functions and type aliases shared across LIMS UI: status enums, label maps, Tailwind class lookups, peak math, and formatters. No side effects, no network.
 */
export type SampleStatus =
  | "received"
  | "intake_verified"
  | "scheduled"
  | "prep"
  | "in_progress"
  | "in_analysis"
  | "on_hold"
  | "reviewed"
  | "complete"
  | "approved"
  | "cancelled";

export const STATUS_LABEL: Record<SampleStatus, string> = {
  received: "Received",
  intake_verified: "Intake Verified",
  scheduled: "Scheduled",
  prep: "Prep",
  in_progress: "In Progress",
  in_analysis: "In Analysis",
  on_hold: "On Hold",
  reviewed: "In Review",
  complete: "Complete",
  approved: "Approved",
  cancelled: "Cancelled",
};

/**
 * Simplified 6-value vocabulary for humans: every UI surface (filters,
 * badges, dashboard counts, detail-page action buttons) works off this
 * instead of the 11-value SampleStatus. The underlying enum, every
 * status-writing code path, and the partner Status API are unchanged —
 * this is purely a display-layer grouping, not a schema change.
 */
export type DisplayStatus = "received" | "in_progress" | "on_hold" | "in_review" | "complete" | "cancelled";

export const DISPLAY_STATUS_MAP: Record<SampleStatus, DisplayStatus> = {
  received: "received",
  intake_verified: "in_progress",
  scheduled: "in_progress",
  prep: "in_progress",
  in_progress: "in_progress",
  in_analysis: "in_progress",
  on_hold: "on_hold",
  reviewed: "in_review",
  complete: "complete",
  approved: "complete",
  cancelled: "cancelled",
};

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  received: "Received",
  in_progress: "In Progress",
  on_hold: "On Hold",
  in_review: "In Review",
  complete: "Complete",
  cancelled: "Cancelled",
};

export function toDisplayStatus(s: SampleStatus): DisplayStatus {
  return DISPLAY_STATUS_MAP[s];
}

/**
 * The one concrete raw status to write when a human picks a display status
 * from a simplified control (detail-page buttons, queue bulk-flag select).
 * `in_review`/`complete` map to `reviewed`/`approved` (not the bare
 * `complete` value) so the existing results.reviewed_at/approved_at gates
 * in updateSampleStatus keep doing their job unchanged.
 */
export const CANONICAL_STATUS_FOR_DISPLAY: Record<DisplayStatus, SampleStatus> = {
  received: "received",
  in_progress: "in_progress",
  on_hold: "on_hold",
  in_review: "reviewed",
  complete: "approved",
  cancelled: "cancelled",
};

/**
 * Raw statuses considered "active" — eligible for run-list generation and
 * queue scheduling, and counted as open work on the dashboard. Shared so
 * those three places can't disagree with each other.
 */
export const ACTIVE_SAMPLE_STATUSES: SampleStatus[] = (Object.keys(DISPLAY_STATUS_MAP) as SampleStatus[])
  .filter((s) => DISPLAY_STATUS_MAP[s] === "received" || DISPLAY_STATUS_MAP[s] === "in_progress");

/**
 * Coarse progress percent per stage. Exposed by the partner Status API so a
 * client portal can render a progress bar without knowing our internal enum.
 */
export const STATUS_PERCENT: Record<SampleStatus, number> = {
  received: 5,
  intake_verified: 15,
  scheduled: 20,
  prep: 30,
  in_progress: 55,
  in_analysis: 60,
  on_hold: 50,
  reviewed: 75,
  complete: 90,
  approved: 100,
  cancelled: 0,
};

/**
 * Forward-only lifecycle used by both the UI (which next-step buttons to show)
 * and the server (which transitions are allowed). Queue-side states
 * (scheduled / in_analysis / on_hold) are included so a sample flagged from the
 * Analysis Queue is never a dead end.
 */
export const SAMPLE_STATUS_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  received: ["intake_verified", "cancelled"],
  intake_verified: ["scheduled", "prep", "cancelled"],
  scheduled: ["prep", "on_hold", "cancelled"],
  prep: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["in_analysis", "reviewed", "on_hold"],
  in_analysis: ["reviewed", "on_hold"],
  on_hold: ["prep", "in_progress", "cancelled"],
  // "approved" is offered directly alongside "complete" so the simplified
  // detail-page UI can merge them into one "Complete" action (they display
  // identically — see DISPLAY_STATUS_MAP above) without a separate manual
  // "complete" click first. Mirrors the server-side copy in samples.functions.ts.
  reviewed: ["complete", "approved"],
  complete: ["approved"],
  approved: [],
  cancelled: ["received"],
};

export function statusClasses(s: SampleStatus): string {
  switch (s) {
    case "received": return "bg-muted text-muted-foreground border-border";
    case "scheduled":
    case "intake_verified": return "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30";
    case "prep": return "bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30";
    case "in_analysis":
    case "in_progress": return "bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30";
    case "on_hold": return "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/40";
    case "cancelled": return "bg-destructive/10 text-destructive border-destructive/30";
    case "reviewed": return "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30";
    case "complete":
    case "approved":
      return "bg-[color:var(--status-success)]/10 text-[color:var(--status-success)] border-[color:var(--status-success)]/30";
  }
}

export function displayStatusClasses(s: DisplayStatus): string {
  switch (s) {
    case "received": return "bg-muted text-muted-foreground border-border";
    case "in_progress": return "bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30";
    case "on_hold": return "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/40";
    case "in_review": return "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30";
    case "complete": return "bg-[color:var(--status-success)]/10 text-[color:var(--status-success)] border-[color:var(--status-success)]/30";
    case "cancelled": return "bg-destructive/10 text-destructive border-destructive/30";
  }
}

export function generateBatchId() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `PEP-${yr}-${String(rand).padStart(4, "0")}`;
}

export interface Peak {
  peak_id: string;
  rt: number;
  /** Nullable: honest "not available" rather than a fake 0 when the source report has no raw area column. */
  area: number | null;
  area_pct: number;
  identity?: string;
  sn?: number;
  /** From a Drive-imported instrument report, when available. */
  amount_per_vial_mg?: number | null;
  percent_label_claim?: number | null;
  height?: number | null;
  rf?: number | null;
  concentration_mg?: number | null;
  peak_purity?: number | null;
  peak_purity_passed?: boolean | null;
  uv_match?: number | null;
  wavelength_nm?: number | null;
}

export function fmtPct(n: number | null | undefined, digits = 3) {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits) + "%";
}

/**
 * Derive a short uppercase token for SYN_mmddyy_<token>_n IDs.
 * Tries first+last+middle initials from full_name first, then email prefix.
 */
export function analystInitials(
  profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined,
  fallbackEmail?: string | null,
): string {
  const clean = (s: string) => s.replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const fn = (profile?.first_name ?? "").trim();
  const ln = (profile?.last_name ?? "").trim();
  if (fn || ln) {
    const initials = `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase();
    if (initials) return clean(initials) || "NA";
  }
  const full = (profile?.full_name ?? "").trim();
  if (full) {
    const initials = full
      .split(/\s+/)
      .map(p => p[0] ?? "")
      .join("")
      .toUpperCase();
    if (initials) return clean(initials) || "NA";
  }
  const email = (profile?.email ?? fallbackEmail ?? "").trim();
  if (email) {
    const prefix = email.split("@")[0]?.toUpperCase() ?? "";
    const c = clean(prefix);
    if (c) return c;
  }
  return "NA";
}

/** Format a date as MMDDYY for SYN IDs. */
export function synDatePart(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

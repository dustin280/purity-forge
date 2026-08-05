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
  reviewed: ["complete"],
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

export function generateBatchId() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `PEP-${yr}-${String(rand).padStart(4, "0")}`;
}

export interface Peak {
  peak_id: string;
  rt: number;
  area: number;
  area_pct: number;
  identity?: string;
  sn?: number;
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

export type SampleStatus = "received" | "in_progress" | "reviewed" | "approved";

export const STATUS_LABEL: Record<SampleStatus, string> = {
  received: "Received",
  in_progress: "In Progress",
  reviewed: "Reviewed",
  approved: "Approved",
};

export function statusClasses(s: SampleStatus): string {
  switch (s) {
    case "received": return "bg-muted text-muted-foreground border-border";
    case "in_progress": return "bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30";
    case "reviewed": return "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30";
    case "approved": return "bg-[color:var(--status-success)]/10 text-[color:var(--status-success)] border-[color:var(--status-success)]/30";
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

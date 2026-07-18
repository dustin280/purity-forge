import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type Props = {
  health: "healthy" | "approaching" | "full";
  slots: number;
  nextAcceptDate: string | null;
  leadTimeDays: number | null;
  atRiskCount: number;
};

const CFG = {
  healthy: {
    label: "HEALTHY",
    icon: CheckCircle2,
    bar: "from-emerald-600/40 via-emerald-500/25 to-transparent",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  approaching: {
    label: "APPROACHING CAPACITY",
    icon: AlertTriangle,
    bar: "from-amber-500/40 via-amber-400/25 to-transparent",
    text: "text-amber-300",
    border: "border-amber-500/30",
  },
  full: {
    label: "FULL",
    icon: XCircle,
    bar: "from-rose-600/40 via-rose-500/25 to-transparent",
    text: "text-rose-400",
    border: "border-rose-500/40",
  },
} as const;

export function StatusBanner({ health, slots, nextAcceptDate, leadTimeDays, atRiskCount }: Props) {
  const c = CFG[health];
  const Icon = c.icon;
  const sub =
    health === "full"
      ? nextAcceptDate
        ? `Next available for new samples: ${formatShort(nextAcceptDate)}`
        : "Stop accepting new samples — queue exceeds TAT"
      : nextAcceptDate
        ? `Next available for new samples: ${leadTimeDays === 0 ? "Today" : formatShort(nextAcceptDate)}`
        : "No availability within TAT window";
  return (
    <div className={cn("rounded-xl border bg-gradient-to-r p-5", c.bar, c.border)}>
      <div className="flex items-center gap-3">
        <Icon className={cn("size-6", c.text)} />
        <div className="text-2xl sm:text-3xl font-bold text-foreground">
          Queue Status: <span className={c.text}>{c.label}</span>
        </div>
      </div>
      <div className="text-sm text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="font-medium text-foreground">{slots}</span> analysis slots available today
        </span>
        <span className="opacity-60">|</span>
        <span>{sub}</span>
        {atRiskCount > 0 && (
          <>
            <span className="opacity-60">|</span>
            <span className="text-amber-300">{atRiskCount} at-risk</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatShort(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";

type DaySlot = {
  date: string;
  weekday: number;
  is_business_day: boolean;
  capacity: number;
  booked: number;
  available: number;
};

export function CapacityOverview({
  days,
  activeDate,
  onSelect,
}: {
  days: DaySlot[];
  activeDate: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4">
        <div className="text-base font-semibold">Capacity Overview</div>
        <div className="text-xs text-muted-foreground">Rolling {days.length}-Day Workflow</div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {days.map((d, idx) => {
          const pct = d.capacity === 0 ? 0 : Math.round((d.booked / d.capacity) * 100);
          const tone =
            d.capacity === 0
              ? "bg-muted-foreground/30"
              : pct >= 100
                ? "bg-rose-500"
                : pct >= 80
                  ? "bg-amber-400"
                  : "bg-emerald-500";
          const label =
            idx === 0 ? `Today: ${d.booked}/${d.capacity} booked`
              : idx === 1 ? `Tomorrow: ${d.booked}/${d.capacity}`
                : `${labelDate(d.date)}: ${d.booked}/${d.capacity}`;
          const availLine = d.capacity === 0
            ? "Closed"
            : d.available === 0 ? "Fully Booked" : `${d.available} available`;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              className={cn(
                "shrink-0 w-44 rounded-lg border p-3 text-left transition-colors",
                activeDate === d.date ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-accent/40",
              )}
            >
              <div className="text-xs font-medium text-foreground truncate">{label}</div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                <FlaskConical className="size-3.5" />
                {availLine}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function labelDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
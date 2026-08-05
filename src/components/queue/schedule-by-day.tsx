import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

type Sample = {
  id: string;
  batch_id: string;
  client: string;
  compound: string | null;
  receipt_date: string;
  due_date: string;
  status: string;
};

type Day = {
  date: string;
  samples: Sample[];
};

const STATUS_TONE: Record<string, string> = {
  scheduled: "text-emerald-400 bg-emerald-500/10",
  in_analysis: "text-sky-300 bg-sky-500/10",
  in_progress: "text-sky-300 bg-sky-500/10",
  received: "text-amber-300 bg-amber-500/10",
  intake_verified: "text-amber-300 bg-amber-500/10",
  prep: "text-amber-300 bg-amber-500/10",
  on_hold: "text-rose-300 bg-rose-500/10",
  complete: "text-emerald-400 bg-emerald-500/10",
  approved: "text-emerald-400 bg-emerald-500/10",
  cancelled: "text-muted-foreground bg-muted",
};

export function ScheduleByDay({
  days,
  activeDate,
  onSelectDate,
  onOpenSample,
  selected,
  onToggleOne,
  onToggleAll,
}: {
  days: Day[];
  activeDate: string | null;
  onSelectDate: (d: string) => void;
  onOpenSample: (batchId: string) => void;
  selected: Set<string>;
  onToggleOne: (id: string, checked: boolean) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
}) {
  const day = days.find((d) => d.date === activeDate) ?? days[0];
  const dayIds = day?.samples.map((s) => s.id) ?? [];
  const allSelected = dayIds.length > 0 && dayIds.every((id) => selected.has(id));
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="text-base font-semibold">Analysis Schedule by Day</div>
        <div className="text-xs text-muted-foreground">FIFO by earliest due date</div>
      </div>

      <div className="p-3 flex gap-2 flex-wrap border-b">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelectDate(d.date)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs border transition-colors",
              activeDate === d.date
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {i === 0 ? "TODAY" : i === 1 ? "TOMORROW" : `+${i} DAYS`} ({formatShort(d.date)})
          </button>
        ))}
      </div>

      <div className="divide-y">
        {(() => {
          if (!day) return null;
          if (day.samples.length === 0) {
            return (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No samples scheduled for this day.
              </div>
            );
          }
          return (
            <>
              <div className="flex items-center gap-3 px-4 py-2 text-xs bg-muted/30">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => onToggleAll(dayIds, !!v)}
                  aria-label="Select all samples for this day"
                />
                <span className="text-muted-foreground">
                  Select all ({dayIds.length})
                </span>
              </div>
              {day.samples.map((s) => (
            <div
              key={s.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40 text-left"
            >
              <Checkbox
                checked={selected.has(s.id)}
                onCheckedChange={(v) => onToggleOne(s.id, !!v)}
                aria-label={`Select ${s.batch_id}`}
              />
              <button
                type="button"
                onClick={() => onOpenSample(s.batch_id)}
                className="flex-1 flex items-center gap-3 text-left"
              >
              <span className="text-muted-foreground">Sample ID:</span>
              <span className="font-mono text-foreground">{s.batch_id}</span>
              <span className="text-muted-foreground">Type:</span>
              <span className="text-foreground truncate">{s.compound ?? "—"}</span>
              <span className="text-muted-foreground">Due:</span>
              <span className="text-foreground">{formatShort(s.due_date)}</span>
              <span className="text-muted-foreground truncate flex-1">{s.client}</span>
              <span className="text-muted-foreground">Status:</span>
              <span className={cn("px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium", STATUS_TONE[s.status] ?? "bg-muted")}>
                {s.status.replace("_", " ")}
              </span>
              </button>
            </div>
              ))}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function formatShort(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
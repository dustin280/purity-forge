import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InstrumentLiveOverview } from "@/lib/instrument-feed.functions";

/** The agent posts every second; anything older than this is treated as offline. */
export const OFFLINE_AFTER_MS = 30_000;

export type LiveState = "running" | "idle" | "offline";

export function liveStateOf(item: InstrumentLiveOverview, now = Date.now()): LiveState {
  const last = item.status?.last_batch_at ? new Date(item.status.last_batch_at).getTime() : null;
  if (last === null || now - last > OFFLINE_AFTER_MS) return "offline";
  return item.status?.status === "running" ? "running" : "idle";
}

export function LiveStateBadge({ state }: { state: LiveState }) {
  if (state === "running") {
    return (
      <Badge className="bg-[var(--status-success,oklch(0.65_0.15_150))] text-background gap-1.5">
        <span className="size-1.5 rounded-full bg-background animate-pulse" /> Running
      </Badge>
    );
  }
  if (state === "idle") return <Badge variant="secondary">Idle</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Offline
    </Badge>
  );
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InstrumentStatusList({
  items,
  selectedId,
  onSelect,
  isLoading,
}: {
  items: InstrumentLiveOverview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}) {
  if (isLoading)
    return <div className="text-sm text-muted-foreground p-3">Loading instruments…</div>;
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-3">
        No active instruments. Add one under Admin → Instruments.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const state = liveStateOf(item);
        const pressure = item.status?.latest?.["PMP1B_Pressure"];
        const selected = item.instrument.id === selectedId;
        return (
          <button
            key={item.instrument.id}
            type="button"
            onClick={() => onSelect(item.instrument.id)}
            className={cn("w-full text-left", selected ? "" : "opacity-90 hover:opacity-100")}
          >
            <Card
              className={cn(
                "p-3 transition-colors",
                selected ? "border-primary" : "hover:border-primary/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{item.instrument.name}</div>
                <LiveStateBadge state={state} />
              </div>
              {item.instrument.location && (
                <div className="text-xs text-muted-foreground">{item.instrument.location}</div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="text-muted-foreground">Pressure</div>
                <div className="tabular-nums">
                  {pressure && state !== "offline"
                    ? `${pressure.v.toFixed(1)} ${pressure.units}`
                    : "—"}
                </div>
                <div className="text-muted-foreground">Injection</div>
                <div>
                  {item.current_run && state === "running"
                    ? `#${item.current_run.injection_index} · started ${ago(item.current_run.started_at)}`
                    : "—"}
                </div>
                <div className="text-muted-foreground">Sequence</div>
                <div>
                  {item.current_sequence
                    ? `${item.current_sequence.injections_count} inj · ${ago(item.current_sequence.started_at)}`
                    : "—"}
                </div>
                <div className="text-muted-foreground">Column</div>
                <div
                  className="truncate"
                  title={item.status?.column_info?.part_number ?? undefined}
                >
                  {item.status?.column_info?.description ?? "—"}
                  {item.status?.column_info?.injections != null
                    ? ` · ${item.status.column_info.injections} inj`
                    : ""}
                </div>
                <div className="text-muted-foreground">Agent</div>
                <div className="truncate">
                  {item.status?.agent_host ?? "—"}
                  {item.status?.last_batch_at ? ` · ${ago(item.status.last_batch_at)}` : ""}
                </div>
              </div>
              {item.status?.not_ready_text && state !== "offline" && (
                <div className="mt-2 text-xs text-[var(--status-warning,oklch(0.75_0.15_80))]">
                  {item.status.not_ready_text}
                </div>
              )}
            </Card>
          </button>
        );
      })}
    </div>
  );
}

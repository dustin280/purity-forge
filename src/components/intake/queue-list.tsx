import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, CheckCircle2 } from "lucide-react";
import type { IntakeSample } from "./types";

/**
 * Renders the intake queue as one card with rows grouped by source CoC.
 * Handles loading, empty, and grouped states. Verify clicks bubble up.
 */
export function IntakeQueueList({
  rows, isLoading, onVerify,
}: {
  rows: IntakeSample[];
  isLoading: boolean;
  onVerify: (sample: IntakeSample) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, IntakeSample[]>();
    for (const r of rows) {
      const key = r.coc_id ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <Card className="border-border overflow-hidden">
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          <Inbox className="size-8 mx-auto mb-2 opacity-40" />
          Intake queue is empty. Submit a Chain of Custody to stage new samples.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {grouped.map(([cocKey, items]) => {
            const cocLabel = items[0]?.batch_id.split("-").slice(0, 2).join("-") || "Unlinked";
            return (
              <div key={cocKey} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono">{cocLabel}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {items[0]?.client} · {items.length} sample{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {items.map(s => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono font-semibold">{s.batch_id}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.compound ?? "(no compound)"} {s.lot ? `· Lot ${s.lot}` : ""}
                          {s.container_size ? ` · ${s.container_size}` : ""}
                          {s.temperature_c != null ? ` · ${s.temperature_c}°C` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground hidden sm:block max-w-[40%] truncate">
                        {s.parameters?.length ? `Tests: ${s.parameters.join(", ")}` : "no tests selected"}
                      </div>
                      <Button size="sm" onClick={() => onVerify(s)}>
                        <CheckCircle2 className="size-3.5 mr-1" /> Verify
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
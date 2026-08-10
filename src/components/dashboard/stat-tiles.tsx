import { Card } from "@/components/ui/card";
import { Beaker, FlaskConical, ClipboardCheck, CheckCircle2, PauseCircle } from "lucide-react";
import type { DisplayStatus } from "@/lib/lims-utils";

type Counts = Partial<Record<DisplayStatus, number>>;

export function StatTiles({ counts }: { counts: Counts | undefined }) {
  const tiles = [
    { label: "Received", value: counts?.received ?? 0, icon: Beaker, color: "var(--muted-foreground)" },
    { label: "In Progress", value: counts?.in_progress ?? 0, icon: FlaskConical, color: "var(--status-warning)" },
    { label: "On Hold", value: counts?.on_hold ?? 0, icon: PauseCircle, color: "var(--status-warning)" },
    { label: "In Review", value: counts?.in_review ?? 0, icon: ClipboardCheck, color: "var(--status-info)" },
    { label: "Complete", value: counts?.complete ?? 0, icon: CheckCircle2, color: "var(--status-success)" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => (
        <Card key={t.label} className="p-4 border-border">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.label}</div>
              <div className="text-3xl font-bold mt-2 font-mono" style={{ color: t.color }}>{t.value}</div>
            </div>
            <t.icon className="size-5 text-muted-foreground/60" />
          </div>
        </Card>
      ))}
    </div>
  );
}
import { Card } from "@/components/ui/card";
import { Beaker, FlaskConical, ClipboardCheck, CheckCircle2, Inbox } from "lucide-react";

type Counts = {
  received?: number; prep?: number; in_progress?: number;
  reviewed?: number; complete?: number; approved?: number;
};

export function StatTiles({ counts }: { counts: Counts | undefined }) {
  const tiles = [
    { label: "Received", value: counts?.received ?? 0, icon: Beaker, color: "var(--muted-foreground)" },
    { label: "Prep", value: counts?.prep ?? 0, icon: Inbox, color: "var(--status-warning)" },
    { label: "In Progress", value: counts?.in_progress ?? 0, icon: FlaskConical, color: "var(--status-warning)" },
    { label: "In Review", value: counts?.reviewed ?? 0, icon: ClipboardCheck, color: "var(--status-info)" },
    { label: "Complete", value: (counts?.complete ?? 0) + (counts?.approved ?? 0), icon: CheckCircle2, color: "var(--status-success)" },
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
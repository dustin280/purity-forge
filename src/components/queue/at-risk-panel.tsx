import { AlertTriangle } from "lucide-react";

type Sample = {
  id: string;
  batch_id: string;
  client: string;
  compound: string | null;
  due_date: string;
};

export function AtRiskPanel({ samples, onOpen }: { samples: Sample[]; onOpen: (b: string) => void }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-semibold mb-2">At-Risk Samples</div>
      {samples.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nothing due within 2 days.</div>
      ) : (
        <div className="space-y-1.5">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.batch_id)}
              className="w-full text-left flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <AlertTriangle className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{s.batch_id}</div>
                <div className="truncate">{s.client} — due {formatShort(s.due_date)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatShort(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
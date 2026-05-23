/**
 * Ordered list of preparation steps plus optional mixing/sonication/heating
 * details. Rendered only when the prep has at least one step row.
 */
import { Card } from "@/components/ui/card";

type Step = {
  step_no: number;
  description?: string | null;
  amount?: string | null;
  instrument_id?: string | null;
  time?: string | null;
};

export function PrepStepsCard({ steps, mixingDetails }: { steps: Step[]; mixingDetails?: string | null }) {
  if (!steps?.length) return null;
  return (
    <Card className="p-5 mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Steps</h2>
      <ol className="space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 border-b last:border-0 pb-2 last:pb-0">
            <div className="font-mono text-xs text-muted-foreground w-6 pt-0.5">{s.step_no}</div>
            <div className="flex-1 min-w-0">
              <div className="whitespace-pre-wrap">{s.description || "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {[s.amount && `Amount: ${s.amount}`, s.instrument_id && `Instr: ${s.instrument_id}`, s.time && `Time: ${s.time}`].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {mixingDetails && (
        <div className="mt-3 pt-3 border-t text-sm">
          <div className="text-xs text-muted-foreground mb-1">Mixing / sonication / heating</div>
          <div className="whitespace-pre-wrap">{mixingDetails}</div>
        </div>
      )}
    </Card>
  );
}
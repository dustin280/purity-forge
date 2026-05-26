import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GradientStep } from "@/lib/parameter-scouting.functions";

interface GradientEditorProps {
  rows: GradientStep[];
  onChange: (next: GradientStep[]) => void;
  disabled?: boolean;
}

export function GradientEditor({ rows, onChange, disabled }: GradientEditorProps) {
  const update = (i: number, patch: Partial<GradientStep>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...rows, { time_min: 0, percent_a: 95, percent_b: 5 }]);

  return (
    <div className="border rounded-md">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        <div>Time (min)</div>
        <div>% A</div>
        <div>% B</div>
        <div className="w-8" />
      </div>
      <div className="divide-y">
        {rows.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No gradient steps yet.
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 items-center"
          >
            <Input
              type="number"
              step="0.01"
              value={Number.isFinite(r.time_min) ? r.time_min : ""}
              onChange={(e) => {
                const n = e.target.value === "" ? 0 : Number(e.target.value);
                update(i, { time_min: n });
              }}
              disabled={disabled}
            />
            <Input
              type="number"
              step="0.1"
              value={Number.isFinite(r.percent_a) ? r.percent_a : ""}
              onChange={(e) => {
                const a = e.target.value === "" ? 0 : Number(e.target.value);
                update(i, { percent_a: a, percent_b: 100 - a });
              }}
              disabled={disabled}
            />
            <Input
              type="number"
              step="0.1"
              value={Number.isFinite(r.percent_b) ? r.percent_b : ""}
              onChange={(e) => {
                const b = e.target.value === "" ? 0 : Number(e.target.value);
                update(i, { percent_b: b });
              }}
              disabled={disabled}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-destructive"
              onClick={() => remove(i)}
              disabled={disabled}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="p-2 border-t">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={disabled}
        >
          <Plus className="size-3.5 mr-1" /> Add step
        </Button>
      </div>
    </div>
  );
}
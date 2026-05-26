import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompoundPicker, type CompoundOption } from "./compound-picker";
import type { RunListItem } from "@/lib/parameter-scouting.functions";

interface RunListEditorProps {
  rows: RunListItem[];
  options: CompoundOption[];
  onChange: (next: RunListItem[]) => void;
  onCreateCompound?: (name: string) => Promise<CompoundOption>;
  disabled?: boolean;
}

export function RunListEditor({
  rows,
  options,
  onChange,
  onCreateCompound,
  disabled,
}: RunListEditorProps) {
  const update = (i: number, patch: Partial<RunListItem>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => {
    if (rows.length >= 400) return;
    onChange([
      ...rows,
      { parameter_id: null, name: "", concentration_mg_per_l: null },
    ]);
  };

  return (
    <div className="border rounded-md">
      <div className="grid grid-cols-[1fr_180px_auto] gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        <div>Compound</div>
        <div>Concentration (mg/L)</div>
        <div className="w-8" />
      </div>
      <div className="divide-y max-h-[440px] overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No compounds added yet.
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_180px_auto] gap-2 px-3 py-2 items-center"
          >
            <CompoundPicker
              options={options}
              value={{ parameter_id: r.parameter_id, name: r.name }}
              onChange={(v) => update(i, v)}
              onCreateCompound={onCreateCompound}
              disabled={disabled}
            />
            <Input
              type="number"
              step="0.01"
              value={
                r.concentration_mg_per_l === null ||
                r.concentration_mg_per_l === undefined
                  ? ""
                  : r.concentration_mg_per_l
              }
              onChange={(e) =>
                update(i, {
                  concentration_mg_per_l:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="mg/L"
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
      <div className="p-2 border-t flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {rows.length} / 400 compounds
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={disabled || rows.length >= 400}
        >
          <Plus className="size-3.5 mr-1" /> Add compound
        </Button>
      </div>
    </div>
  );
}
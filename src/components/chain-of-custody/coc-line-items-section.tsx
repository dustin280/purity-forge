import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash } from "lucide-react";
import { LineItemRow } from "./line-item-row";
import { emptyLine, type LineItem } from "./types";
import type { CompoundOption } from "@/components/compounds/compound-picker";

/**
 * "Compounds / Lots" section of the CoC form. Each row is one sample; in edit
 * mode the rows are locked because Sample IDs are assigned on submit.
 */
export function CocLineItemsSection({
  recordId,
  lineItems,
  setLineItemsDirty,
  activeParams,
  compoundOptions,
  onCreateCompound,
  pendingByLine,
  setPendingByLine,
  setIsDirty,
}: {
  recordId: string | null;
  lineItems: LineItem[];
  setLineItemsDirty: (updater: (prev: LineItem[]) => LineItem[]) => void;
  activeParams: { id: string; name: string }[];
  compoundOptions: CompoundOption[];
  onCreateCompound: (name: string) => Promise<CompoundOption>;
  pendingByLine: Record<number, File[]>;
  setPendingByLine: (updater: (prev: Record<number, File[]>) => Record<number, File[]>) => void;
  setIsDirty: (v: boolean) => void;
}) {
  const addRow = () => setLineItemsDirty(prev => [...prev, emptyLine()]);
  return (
    <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <Label className="text-sm font-semibold">Compounds / Lots</Label>
          <p className="text-xs text-muted-foreground">One row per sample. Each row creates a unique Sample ID on submit.</p>
        </div>
        {!recordId && (
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-3.5 mr-1" /> Add row
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {lineItems.map((li, idx) => (
          <div key={idx} className="rounded-md border border-border p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                Row {String(idx + 1).padStart(2, "0")}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                × {Math.max(1, li.vial_count || 1)} vial{(li.vial_count || 1) === 1 ? "" : "s"}
              </Badge>
              {!recordId && lineItems.length > 1 && (
                <Button type="button" size="icon" variant="ghost" className="size-6 ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => setLineItemsDirty(prev => prev.filter((_, i) => i !== idx))}>
                  <Trash className="size-3.5" />
                </Button>
              )}
            </div>
            <LineItemRow
              li={li}
              disabled={!!recordId}
              onChange={(patch) => setLineItemsDirty(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))}
              testOptions={activeParams}
              compoundOptions={compoundOptions}
              onCreateCompound={onCreateCompound}
              pendingFiles={pendingByLine[idx] ?? []}
              onAddFiles={(files) => { setIsDirty(true); setPendingByLine(prev => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...files] })); }}
              onRemoveFile={(fileIdx) => { setIsDirty(true); setPendingByLine(prev => ({ ...prev, [idx]: (prev[idx] ?? []).filter((_, i) => i !== fileIdx) })); }}
            />
          </div>
        ))}
      </div>
      {!recordId && (
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-3.5 mr-1" /> Add row
          </Button>
        </div>
      )}
      {recordId && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Line items are locked after submission to keep Sample IDs stable. Edits to individual samples happen in Intake / Samples.
        </p>
      )}
    </div>
  );
}
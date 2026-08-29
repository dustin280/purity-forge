/**
 * Level 3 of the intake hierarchy: one physical vial, assigned to exactly
 * one test. Visual weight is deliberately the lightest of the three levels
 * (see lot-card.tsx for level 2) so the nesting reads at a glance.
 */
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { TEST_TYPE_LABEL, TEST_TYPE_SHORT, type TestType } from "@/lib/lims/sample-hierarchy";
import type { VialRow } from "./types";

const TEST_TYPES: TestType[] = ["purity", "sterility", "endotoxin", "heavy_metals"];

/** Tint per test so a row is identifiable without reading it. */
const TEST_TONE: Record<TestType, string> = {
  purity: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  sterility: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  endotoxin: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  heavy_metals: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export function VialRowEditor({
  vial, vialId, disabled, onChange, onRemove, canRemove, lotAppearance,
}: {
  vial: VialRow;
  /** Rendered level-3 id, e.g. "SYX-000010-01-03". */
  vialId: string;
  disabled: boolean;
  onChange: (patch: Partial<VialRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  /** Shown as the placeholder so it's obvious the vial inherits the lot's. */
  lotAppearance: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-foreground/90">{vialId}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${TEST_TONE[vial.test_type]}`}>
          {TEST_TYPE_SHORT[vial.test_type]}
        </span>
        <div className="flex-1" />
        {!disabled && canRemove && (
          <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">Test</label>
          <Select value={vial.test_type} disabled={disabled} onValueChange={(v) => onChange({ test_type: v as TestType })}>
            <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEST_TYPES.map((t) => <SelectItem key={t} value={t}>{TEST_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">Client Lot (this vial)</label>
          <Input
            className="h-8 mt-1 font-mono text-xs" value={vial.partner_lot} disabled={disabled}
            placeholder="inherits lot"
            onChange={(e) => onChange({ partner_lot: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">Appearance override</label>
          <Input
            className="h-8 mt-1" value={vial.physical_description} disabled={disabled}
            placeholder={lotAppearance || "inherits lot"}
            onChange={(e) => onChange({ physical_description: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

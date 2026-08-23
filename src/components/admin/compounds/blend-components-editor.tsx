import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import {
  listBlendComponents, upsertBlendComponent, deleteBlendComponent,
  type Compound, type BlendComponent,
} from "@/lib/compounds.functions";

const CAL_KEYS = ["cal_l1_mg_per_ml", "cal_l2_mg_per_ml", "cal_l3_mg_per_ml", "cal_l4_mg_per_ml", "cal_l5_mg_per_ml", "cal_l6_mg_per_ml"] as const;

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

/**
 * Per-component-per-level calibration, not a recipe ratio: a blend's L1-L6
 * aren't fractions of one blend concentration (there isn't one) -- each
 * component gets its own independently-placed target at every level, same
 * as the SUMMIT standard set. See compound_blend_components.
 */
export function BlendComponentsEditor({ blendId, allCompounds }: { blendId: string; allCompounds: Compound[] }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBlendComponents);
  const upsertFn = useServerFn(upsertBlendComponent);
  const deleteFn = useServerFn(deleteBlendComponent);

  const qk = ["blend-components", blendId];
  const { data: rows = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => listFn({ data: { blend_id: blendId } }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: qk });

  const [newComponentId, setNewComponentId] = useState("");
  const candidates = allCompounds.filter(c => !c.is_blend && c.id !== blendId && !rows.some(r => r.component_id === c.id));

  const upsertMut = useMutation({
    mutationFn: (row: Partial<BlendComponent> & { id?: string; component_id: string }) =>
      upsertFn({ data: { ...row, blend_id: blendId, sort_order: row.sort_order ?? rows.length } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Component removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function addComponent() {
    if (!newComponentId) return;
    upsertMut.mutate({ component_id: newComponentId }, { onSuccess: () => setNewComponentId("") });
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Each component gets its own target at every level — not a fraction of one blend concentration. Amounts are the recipe's per-vial nominal dose (e.g. 20 mg).
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading components…</div>}
      <div className="overflow-x-auto">
        <table className="text-xs w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-2">Component</th>
              <th className="pb-1 pr-2">Amount</th>
              <th className="pb-1 pr-2">Unit</th>
              {CAL_KEYS.map((k, i) => <th key={k} className="pb-1 pr-2">L{i + 1} mg/mL</th>)}
              <th className="pb-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.component_name}</td>
                <td className="py-1.5 pr-2">
                  <Input className="h-7 w-20 text-xs" type="number" defaultValue={row.nominal_amount_value ?? ""}
                    onBlur={(e) => upsertMut.mutate({ id: row.id, component_id: row.component_id, nominal_amount_value: num(e.target.value) })} />
                </td>
                <td className="py-1.5 pr-2">
                  <Input className="h-7 w-16 text-xs" defaultValue={row.nominal_amount_unit ?? "mg"}
                    onBlur={(e) => upsertMut.mutate({ id: row.id, component_id: row.component_id, nominal_amount_unit: e.target.value })} />
                </td>
                {CAL_KEYS.map(k => (
                  <td key={k} className="py-1.5 pr-2">
                    <Input className="h-7 w-20 text-xs" type="number" step="0.05" defaultValue={row[k] ?? ""}
                      onBlur={(e) => upsertMut.mutate({ id: row.id, component_id: row.component_id, [k]: num(e.target.value) })} />
                  </td>
                ))}
                <td className="py-1.5">
                  <Button size="icon" variant="ghost" onClick={() => removeMut.mutate(row.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Add component</Label>
          <Select value={newComponentId} onValueChange={setNewComponentId}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Select a compound…" /></SelectTrigger>
            <SelectContent>
              {candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" disabled={!newComponentId} onClick={addComponent}>
          <Plus className="size-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

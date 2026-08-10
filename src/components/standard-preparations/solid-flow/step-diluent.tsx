import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Link2, Link2Off } from "lucide-react";
import { OptionPicker } from "./solvent-picker";
import { MaterialReceiptPicker, type PickedReceipt } from "./material-receipt-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { emptySolvent, type DiluentSolvent, type DiluentModifier } from "./types";

interface Props {
  diluent: DiluentSolvent[];
  modifier: DiluentModifier;
  onDiluent: (d: DiluentSolvent[]) => void;
  onModifier: (m: DiluentModifier) => void;
}

export function StepDiluent({ diluent, modifier, onDiluent, onModifier }: Props) {
  const [pickerFor, setPickerFor] = useState<number | "modifier" | null>(null);

  const sum = diluent.reduce((s, x) => s + Number(x.percent || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;

  function updateRow(i: number, patch: Partial<DiluentSolvent>) {
    onDiluent(diluent.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function removeRow(i: number) {
    onDiluent(diluent.filter((_, idx) => idx !== i));
  }
  function addRow() {
    if (diluent.length >= 4) return;
    onDiluent([...diluent, emptySolvent()]);
  }

  function applyReceipt(r: PickedReceipt) {
    if (pickerFor === null) return;
    if (pickerFor === "modifier") {
      onModifier({ ...modifier, material_receipt_id: r.id });
    } else {
      updateRow(pickerFor, {
        material_receipt_id: r.id,
        lot: r.internal_lot || r.manufacturer_lot || "",
        manufacturer: r.manufacturer || "",
        expiry_date: r.expiry_date || "",
      });
    }
    setPickerFor(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 2 — Diluent</h2>
        <p className="text-sm text-muted-foreground">
          Add up to 4 solvents. Percentages must total 100%. Modifier is optional and does not count toward the sum.
        </p>
      </div>

      <div className="space-y-3">
        {diluent.map((s, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Solvent {i + 1}</div>
              {diluent.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Solvent</Label>
                <div className="mt-1">
                  <OptionPicker kind="solvent" value={s.name} onChange={v => updateRow(i, { name: v })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Percent</Label>
                <Input
                  type="number" step="0.1" min="0" max="100"
                  className="mt-1"
                  value={s.percent}
                  onChange={e => updateRow(i, { percent: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Lot #</Label>
                <Input className="mt-1" value={s.lot} onChange={e => updateRow(i, { lot: e.target.value, material_receipt_id: null })} />
              </div>
              <div>
                <Label className="text-xs">Manufacturer</Label>
                <Input className="mt-1" value={s.manufacturer} onChange={e => updateRow(i, { manufacturer: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Expiry</Label>
                <Input type="date" className="mt-1" value={s.expiry_date} onChange={e => updateRow(i, { expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPickerFor(i)}>
                <Link2 className="size-3.5 mr-1" /> From Material Receipt
              </Button>
              {s.material_receipt_id && (
                <Button type="button" size="sm" variant="ghost" onClick={() => updateRow(i, { material_receipt_id: null })}>
                  <Link2Off className="size-3.5 mr-1" /> Unlink
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={diluent.length >= 4}>
          + Add Solvent
        </Button>
        <div className={`text-sm font-medium ${sumOk ? "text-primary" : "text-destructive"}`}>
          Total: {sum.toFixed(1)}% {sumOk ? "✓" : "(must equal 100%)"}
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Modifier (optional)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Modifier</Label>
            <div className="mt-1">
              <OptionPicker kind="modifier" value={modifier.type} onChange={v => onModifier({ ...modifier, type: v })} placeholder="None" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Percent (v/v)</Label>
            <Input
              type="number" step="0.01" min="0" max="100"
              className="mt-1"
              placeholder="e.g. 0.1"
              value={modifier.percent}
              onChange={e => onModifier({ ...modifier, percent: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Dialog open={pickerFor !== null} onOpenChange={o => { if (!o) setPickerFor(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link to Material Receipt</DialogTitle>
            <DialogDescription className="sr-only">
              Pick an existing material receipt to link
            </DialogDescription>
          </DialogHeader>
          <MaterialReceiptPicker onPick={applyReceipt} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

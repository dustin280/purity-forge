import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2 } from "lucide-react";
import { MaterialReceiptPicker, type PickedReceipt } from "./material-receipt-picker";
import { AddReceiptDialog } from "./add-receipt-dialog";
import type { SolidSource } from "./types";

interface Props {
  source: SolidSource | null;
  onChange: (s: SolidSource | null) => void;
  defaultReceiverName: string;
}

export function StepSource({ source, onChange, defaultReceiverName }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [purityDraft, setPurityDraft] = useState<string>("");


  function pick(r: PickedReceipt) {
    onChange({
      material_receipt_id: r.id,
      material_name: r.material_name,
      lot: r.internal_lot || r.manufacturer_lot || "",
      manufacturer: r.manufacturer || "",
      purity_percent: r.purity_percent,
      molecular_weight: r.molecular_weight,
      received_at: r.received_at,
      expiry_date: r.expiry_date,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Source</h2>
        <p className="text-sm text-muted-foreground">
          Select the solid reference material from an approved Material Receipt.
        </p>
      </div>

      {source ? (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold">{source.material_name}</div>
                <div className="text-xs text-muted-foreground">
                  Lot {source.lot || "—"}
                  {source.manufacturer ? ` · ${source.manufacturer}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {source.purity_percent != null ? `${source.purity_percent}% purity` : "purity not recorded"}
                  {source.molecular_weight != null ? ` · MW ${source.molecular_weight}` : ""}
                  {source.expiry_date ? ` · Expires ${source.expiry_date}` : ""}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
              <X className="size-4" />
            </Button>
          </div>

          {source.purity_percent == null && (
            <div className="mt-3 pt-3 border-t">
              <Label className="text-xs">Purity % (required for mass calc)</Label>
              <Input
                type="text"
                inputMode="decimal"
                className="mt-1 max-w-[160px]"
                value={purityDraft}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                  setPurityDraft(raw);
                }}
                onBlur={() => {
                  if (purityDraft === "") return;
                  const n = Number(purityDraft);
                  if (Number.isFinite(n)) onChange({ ...source, purity_percent: n });
                }}
              />
            </div>
          )}
        </Card>
      ) : (
        <MaterialReceiptPicker onPick={pick} onAddNew={() => setAddOpen(true)} />
      )}

      <AddReceiptDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultReceiverName={defaultReceiverName}
        onCreated={pick}
      />
    </div>
  );
}

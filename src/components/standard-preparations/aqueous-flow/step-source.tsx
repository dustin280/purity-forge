import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2 } from "lucide-react";
import { MaterialReceiptPicker, type PickedReceipt } from "../solid-flow/material-receipt-picker";
import { AddReceiptDialog } from "../solid-flow/add-receipt-dialog";
import type { AqueousSource } from "./types";

interface Props {
  source: AqueousSource | null;
  onChange: (s: AqueousSource | null) => void;
  defaultReceiverName: string;
}

export function StepSource({ source, onChange, defaultReceiverName }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [concDraft, setConcDraft] = useState("");
  const [volDraft, setVolDraft] = useState("");

  function pick(r: PickedReceipt) {
    onChange({ ...r, stock_concentration_mg_per_ml: null, available_volume_ml: null });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Source</h2>
        <p className="text-sm text-muted-foreground">
          Select the liquid stock reference material from an approved Material Receipt.
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
                  Lot {source.internal_lot || source.manufacturer_lot || "—"}
                  {source.manufacturer ? ` · ${source.manufacturer}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {source.expiry_date ? `Expires ${source.expiry_date}` : "No expiry recorded"}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
              <X className="size-4" />
            </Button>
          </div>

          {/* material_receipts has no concentration/volume fields (it's shared
              across solids and liquids) — captured here, once, for this prep. */}
          <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3">
            {source.stock_concentration_mg_per_ml == null && (
              <div>
                <Label className="text-xs">Stated concentration (mg/mL) <span className="text-destructive">*</span></Label>
                <Input
                  type="text" inputMode="decimal" className="mt-1"
                  value={concDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                    setConcDraft(raw);
                  }}
                  onBlur={() => {
                    if (concDraft === "") return;
                    const n = Number(concDraft);
                    if (Number.isFinite(n) && n > 0) onChange({ ...source, stock_concentration_mg_per_ml: n });
                  }}
                />
              </div>
            )}
            {source.available_volume_ml == null && (
              <div>
                <Label className="text-xs">Available volume (mL) <span className="text-destructive">*</span></Label>
                <Input
                  type="text" inputMode="decimal" className="mt-1"
                  value={volDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                    setVolDraft(raw);
                  }}
                  onBlur={() => {
                    if (volDraft === "") return;
                    const n = Number(volDraft);
                    if (Number.isFinite(n) && n > 0) onChange({ ...source, available_volume_ml: n });
                  }}
                />
              </div>
            )}
          </div>
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

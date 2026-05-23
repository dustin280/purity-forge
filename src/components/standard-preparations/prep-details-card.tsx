import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Link2 } from "lucide-react";
import { Field } from "./prep-form-field";
import type { UsePrepFormReturn } from "./use-prep-form";

export function PrepDetailsCard({ f, batchMode }: { f: UsePrepFormReturn; batchMode: boolean }) {
  const { v, up, suggestions, pickSuggestion, receiptSearch, setReceiptSearch, receiptPickerOpen, setReceiptPickerOpen, receiptResults, linkReceipt, clearReceipt } = f;

  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preparation Details</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Preparation date & time" required>
          <Input type="datetime-local" value={v.prepared_at} onChange={e => up("prepared_at", e.target.value)} required />
        </Field>
        <Field label="Analyst name" required>
          <Input value={v.analyst_name} onChange={e => up("analyst_name", e.target.value)} required maxLength={255} />
        </Field>
        <Field label={batchMode ? "Batch label (optional)" : "Standard name"} required={!batchMode}>
          <Input
            list="standard-suggestions"
            value={v.standard_name}
            onChange={e => up("standard_name", e.target.value)}
            onBlur={e => pickSuggestion(e.target.value)}
            required={!batchMode}
            maxLength={255}
            placeholder={batchMode ? "e.g. Method validation batch" : "e.g. Peptide Reference Standard"}
          />
          <datalist id="standard-suggestions">
            {suggestions.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </Field>
        <Field label="Manufacturer lot #">
          <Input value={v.manufacturer_lot} onChange={e => up("manufacturer_lot", e.target.value)} maxLength={255} />
        </Field>
        <Field label="Target concentration / strength">
          <Input value={v.target_concentration} onChange={e => up("target_concentration", e.target.value)} placeholder="e.g. 1.0 mg/mL" maxLength={255} />
        </Field>
        <Field label="Final volume prepared">
          <Input value={v.final_volume} onChange={e => up("final_volume", e.target.value)} placeholder="e.g. 10 mL" maxLength={255} />
        </Field>
        <Field label="Solvent / diluent" className="md:col-span-2">
          <Input value={v.solvent} onChange={e => up("solvent", e.target.value)} placeholder="e.g. Water:Acetonitrile (50:50) + 0.1% TFA" maxLength={500} />
        </Field>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Linked Material Receipt</Label>
        {v.material_receipt_id ? (
          <div className="mt-1 flex items-center gap-2 p-2 rounded-md border bg-muted/30">
            <Link2 className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm flex-1 min-w-0 truncate">{v.material_receipt_label}</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearReceipt}>Clear</Button>
          </div>
        ) : (
          <div className="mt-1 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Search receipt # / lot / material…"
                value={receiptSearch}
                onChange={e => { setReceiptSearch(e.target.value); setReceiptPickerOpen(true); }}
                onFocus={() => setReceiptPickerOpen(true)}
              />
              <Button type="button" variant="outline" onClick={() => setReceiptPickerOpen(o => !o)}>
                {receiptPickerOpen ? "Close" : "Browse"}
              </Button>
            </div>
            {receiptPickerOpen && (
              <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                {receiptResults.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3">No matching receipts.</div>
                ) : (
                  receiptResults.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => linkReceipt(r)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                    >
                      <div className="font-mono text-xs">{r.receipt_number}</div>
                      <div className="truncate">{r.material_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.internal_lot ? `Internal lot ${r.internal_lot} · ` : ""}
                        {r.manufacturer_lot ? `Mfr lot ${r.manufacturer_lot}` : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
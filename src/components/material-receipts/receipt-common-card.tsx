import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ReceiptField } from "./receipt-field";
import type { ReceiptFormValues, MaterialSuggestion } from "./receipt-form-logic";

export function ReceiptCommonCard({
  v,
  up,
  filteredSuggestions,
  onPickSuggestion,
}: {
  v: ReceiptFormValues;
  up: <K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) => void;
  filteredSuggestions: MaterialSuggestion[];
  onPickSuggestion: (name: string) => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receipt Details</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ReceiptField label="Date & time of receipt" required>
          <Input type="datetime-local" value={v.received_at} onChange={e => up("received_at", e.target.value)} required />
        </ReceiptField>
        <ReceiptField label="Receiver's name / initials" required>
          <Input value={v.receiver_name} onChange={e => up("receiver_name", e.target.value)} required maxLength={255} />
        </ReceiptField>
        <ReceiptField label="Material / Item name" required>
          <Input
            list="material-suggestions"
            value={v.material_name}
            onChange={e => up("material_name", e.target.value)}
            onBlur={e => onPickSuggestion(e.target.value)}
            required
            maxLength={255}
            placeholder="Start typing…"
          />
          <datalist id="material-suggestions">
            {filteredSuggestions.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </ReceiptField>
        <ReceiptField label="Quantity received">
          <div className="grid grid-cols-3 gap-2">
            <Input className="col-span-2" type="number" step="any" value={v.quantity} onChange={e => up("quantity", e.target.value)} placeholder="0" />
            <Input value={v.unit} onChange={e => up("unit", e.target.value)} placeholder="unit" maxLength={50} />
          </div>
        </ReceiptField>
        <ReceiptField label="Supplier / Vendor">
          <Input value={v.supplier} onChange={e => up("supplier", e.target.value)} maxLength={255} />
        </ReceiptField>
        <ReceiptField label="PO / Invoice number">
          <Input value={v.po_number} onChange={e => up("po_number", e.target.value)} maxLength={100} />
        </ReceiptField>
      </div>
      <ReceiptField label="Notes / comments">
        <Textarea value={v.notes} onChange={e => up("notes", e.target.value)} rows={3} maxLength={4000} />
      </ReceiptField>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
        <Checkbox
          id="register_as_column"
          checked={v.register_as_column}
          onCheckedChange={(c) => up("register_as_column", Boolean(c))}
          className="mt-0.5"
        />
        <div className="grid gap-0.5">
          <Label htmlFor="register_as_column" className="text-sm font-medium cursor-pointer">
            Register this as a new HPLC column
          </Label>
          <p className="text-xs text-muted-foreground">
            Adds this item to the Column selector in the Daily Backpressure Log.
            Uses the material name (and catalog number, if provided) as the part number.
          </p>
        </div>
      </div>
    </Card>
  );
}
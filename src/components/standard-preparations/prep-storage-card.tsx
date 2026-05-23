import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./prep-form-field";
import type { UsePrepFormReturn } from "./use-prep-form";

export function PrepStorageCard({ f }: { f: UsePrepFormReturn }) {
  const { v, up } = f;
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Final Solution & Storage</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Final appearance / observations" className="md:col-span-2">
          <Textarea value={v.appearance_notes} onChange={e => up("appearance_notes", e.target.value)} rows={2} maxLength={2000} />
        </Field>
        <Field label="Expiration / retest date">
          <Input type="date" value={v.expiration_date} onChange={e => up("expiration_date", e.target.value)} />
        </Field>
        <Field label="Storage condition">
          <Input value={v.storage_condition} onChange={e => up("storage_condition", e.target.value)} placeholder="e.g. 2–8 °C, protect from light" maxLength={500} />
        </Field>
        <Field label="Storage location">
          <Input value={v.storage_location} onChange={e => up("storage_location", e.target.value)} placeholder="e.g. Fridge 2 / Shelf B" maxLength={500} />
        </Field>
        <Field label="Vial / container label">
          <Input value={v.container_label} onChange={e => up("container_label", e.target.value)} placeholder="e.g. STD-PREP-... vial #1" maxLength={500} />
        </Field>
        <Field label="Additional notes" className="md:col-span-2">
          <Textarea value={v.notes} onChange={e => up("notes", e.target.value)} rows={3} maxLength={4000} />
        </Field>
      </div>
    </Card>
  );
}
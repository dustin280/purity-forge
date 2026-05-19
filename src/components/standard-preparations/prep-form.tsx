import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Link2 } from "lucide-react";
import {
  listStandardSuggestions,
  searchMaterialReceiptsForLink,
  type PrepStep,
} from "@/lib/standard-preparations.functions";

export interface PrepFormValues {
  prepared_at: string;
  analyst_name: string;
  standard_name: string;
  material_receipt_id: string;
  material_receipt_label: string;
  manufacturer_lot: string;
  target_concentration: string;
  final_volume: string;
  solvent: string;
  preparation_steps: PrepStep[];
  mixing_details: string;
  appearance_notes: string;
  expiration_date: string;
  storage_condition: string;
  storage_location: string;
  container_label: string;
  notes: string;
}

export function emptyPrepValues(analystName: string): PrepFormValues {
  return {
    prepared_at: new Date().toISOString().slice(0, 16),
    analyst_name: analystName,
    standard_name: "",
    material_receipt_id: "",
    material_receipt_label: "",
    manufacturer_lot: "",
    target_concentration: "",
    final_volume: "",
    solvent: "",
    preparation_steps: [{ step_no: 1, description: "", amount: "", instrument_id: "", time: "" }],
    mixing_details: "",
    appearance_notes: "",
    expiration_date: "",
    storage_condition: "",
    storage_location: "",
    container_label: "",
    notes: "",
  };
}

export function prepValuesToPayload(v: PrepFormValues) {
  return {
    prepared_at: new Date(v.prepared_at).toISOString(),
    analyst_name: v.analyst_name,
    standard_name: v.standard_name,
    material_receipt_id: v.material_receipt_id || null,
    manufacturer_lot: v.manufacturer_lot,
    target_concentration: v.target_concentration,
    final_volume: v.final_volume,
    solvent: v.solvent,
    preparation_steps: v.preparation_steps
      .filter(s => s.description.trim() || s.amount.trim() || s.instrument_id.trim() || s.time.trim())
      .map((s, idx) => ({ ...s, step_no: idx + 1 })),
    mixing_details: v.mixing_details,
    appearance_notes: v.appearance_notes,
    expiration_date: v.expiration_date,
    storage_condition: v.storage_condition,
    storage_location: v.storage_location,
    container_label: v.container_label,
    notes: v.notes,
  };
}

interface Props {
  initial?: Partial<PrepFormValues>;
  defaultAnalystName: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: PrepFormValues) => void;
  onCancel?: () => void;
}

export function PrepForm({ initial, defaultAnalystName, submitting, submitLabel = "Save", onSubmit, onCancel }: Props) {
  const [v, setV] = useState<PrepFormValues>(() => ({ ...emptyPrepValues(defaultAnalystName), ...initial }));
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);

  const listSuggestions = useServerFn(listStandardSuggestions);
  const searchReceipts = useServerFn(searchMaterialReceiptsForLink);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["standard-suggestions"],
    queryFn: () => listSuggestions(),
  });

  const { data: receiptResults = [] } = useQuery({
    queryKey: ["receipt-link-search", receiptSearch],
    queryFn: () => searchReceipts({ data: { q: receiptSearch || null } }),
    enabled: receiptPickerOpen,
  });

  useEffect(() => {
    if (!initial && !v.analyst_name && defaultAnalystName) {
      setV(prev => ({ ...prev, analyst_name: defaultAnalystName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAnalystName]);

  const suggestionList = useMemo(() => suggestions, [suggestions]);

  function up<K extends keyof PrepFormValues>(k: K, val: PrepFormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  function pickSuggestion(name: string) {
    if (!name) return;
    const match = suggestionList.find(s => s.name === name);
    setV(prev => ({
      ...prev,
      standard_name: name,
      target_concentration: prev.target_concentration || match?.typical_concentration || "",
      solvent: prev.solvent || match?.typical_solvent || "",
    }));
  }

  function linkReceipt(r: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string }) {
    setV(prev => ({
      ...prev,
      material_receipt_id: r.id,
      material_receipt_label: `${r.receipt_number} — ${r.material_name}${r.internal_lot ? ` (lot ${r.internal_lot})` : ""}`,
      manufacturer_lot: prev.manufacturer_lot || r.manufacturer_lot || "",
    }));
    setReceiptPickerOpen(false);
  }

  function clearReceipt() {
    setV(prev => ({ ...prev, material_receipt_id: "", material_receipt_label: "" }));
  }

  function addStep() {
    setV(prev => ({
      ...prev,
      preparation_steps: [
        ...prev.preparation_steps,
        { step_no: prev.preparation_steps.length + 1, description: "", amount: "", instrument_id: "", time: "" },
      ],
    }));
  }

  function removeStep(idx: number) {
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_no: i + 1 })),
    }));
  }

  function updateStep(idx: number, patch: Partial<PrepStep>) {
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preparation Details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Preparation date & time" required>
            <Input type="datetime-local" value={v.prepared_at} onChange={e => up("prepared_at", e.target.value)} required />
          </Field>
          <Field label="Analyst name" required>
            <Input value={v.analyst_name} onChange={e => up("analyst_name", e.target.value)} required maxLength={255} />
          </Field>
          <Field label="Standard name" required>
            <Input
              list="standard-suggestions"
              value={v.standard_name}
              onChange={e => up("standard_name", e.target.value)}
              onBlur={e => pickSuggestion(e.target.value)}
              required
              maxLength={255}
              placeholder="e.g. Peptide Reference Standard"
            />
            <datalist id="standard-suggestions">
              {suggestionList.map(s => <option key={s.id} value={s.name} />)}
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

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preparation Steps</h2>
          <Button type="button" size="sm" variant="outline" onClick={addStep}>
            <Plus className="size-4 mr-1" /> Add step
          </Button>
        </div>
        <div className="space-y-2">
          {v.preparation_steps.map((step, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-1 pt-2 text-center text-sm font-mono text-muted-foreground">
                {idx + 1}
              </div>
              <Textarea
                className="col-span-12 md:col-span-5"
                rows={2}
                value={step.description}
                onChange={e => updateStep(idx, { description: e.target.value })}
                placeholder="Step description"
                maxLength={2000}
              />
              <Input
                className="col-span-6 md:col-span-2"
                value={step.amount}
                onChange={e => updateStep(idx, { amount: e.target.value })}
                placeholder="Amount"
                maxLength={255}
              />
              <Input
                className="col-span-6 md:col-span-2"
                value={step.instrument_id}
                onChange={e => updateStep(idx, { instrument_id: e.target.value })}
                placeholder="Balance / pipette ID"
                maxLength={255}
              />
              <Input
                className="col-span-11 md:col-span-1"
                value={step.time}
                onChange={e => updateStep(idx, { time: e.target.value })}
                placeholder="Time"
                maxLength={255}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeStep(idx)}
                className="col-span-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Field label="Sonication / vortex / heating details">
          <Textarea value={v.mixing_details} onChange={e => up("mixing_details", e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Vortex 30s, sonicate 5 min at 25 °C" />
        </Field>
      </Card>

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

      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
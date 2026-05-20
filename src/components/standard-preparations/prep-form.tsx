import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Link2, Copy, ExternalLink, AlertTriangle, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listStandardSuggestions,
  searchMaterialReceiptsForLink,
  type PrepStep,
  type PrepTarget,
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
  // Calculator / traceability
  expiration_period_code: ExpirationCode;
  expiration_period_days: string;
  initial_solvent: string;
  final_diluent: string;
  modifier_percent: string;
  material_overridden: boolean;
  ref_material_name: string;
  ref_lot: string;
  ref_purity_percent: string;
  ref_molecular_weight: string;
  ref_receipt_date: string;
  ref_shelf_life_months: string;
  targets: TargetRow[];
}

export type ExpirationCode = "1w" | "2w" | "4w" | "3m" | "6m" | "custom";

export interface TargetRow {
  name: string;
  target_concentration_mg_per_ml: string;
  target_volume_ml: string;
  notes: string;
}

const EXP_PRESETS: Record<Exclude<ExpirationCode, "custom">, { label: string; days: number }> = {
  "1w": { label: "1 week", days: 7 },
  "2w": { label: "2 weeks", days: 14 },
  "4w": { label: "4 weeks", days: 28 },
  "3m": { label: "3 months", days: 90 },
  "6m": { label: "6 months", days: 180 },
};

function emptyTarget(): TargetRow {
  return { name: "", target_concentration_mg_per_ml: "", target_volume_ml: "", notes: "" };
}

function periodDays(code: ExpirationCode, customDays: string): number | null {
  if (code === "custom") {
    const n = Number(customDays);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return EXP_PRESETS[code].days;
}

function addDaysISO(dateInput: string, days: number): string {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function calcMassMg(concMgPerMl: number, volMl: number, purityPct: number | null): number {
  const raw = concMgPerMl * volMl;
  if (!purityPct || purityPct <= 0) return raw;
  return raw / (purityPct / 100);
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
    expiration_period_code: "2w",
    expiration_period_days: "14",
    initial_solvent: "",
    final_diluent: "HPLC Grade Water + 0.1% TFA",
    modifier_percent: "",
    material_overridden: false,
    ref_material_name: "",
    ref_lot: "",
    ref_purity_percent: "",
    ref_molecular_weight: "",
    ref_receipt_date: "",
    ref_shelf_life_months: "",
    targets: [emptyTarget()],
  };
}

export function prepValuesToPayload(v: PrepFormValues) {
  const purity = v.ref_purity_percent === "" ? null : Number(v.ref_purity_percent);
  const days = periodDays(v.expiration_period_code, v.expiration_period_days);
  const expDate = days != null && v.prepared_at ? addDaysISO(v.prepared_at, days) : v.expiration_date || null;
  const targets: PrepTarget[] = v.targets
    .map((t, idx) => {
      const conc = t.target_concentration_mg_per_ml === "" ? null : Number(t.target_concentration_mg_per_ml);
      const vol = t.target_volume_ml === "" ? null : Number(t.target_volume_ml);
      const mass = conc != null && vol != null ? calcMassMg(conc, vol, purity) : null;
      return {
        row_no: idx + 1,
        name: t.name,
        target_concentration_mg_per_ml: conc,
        target_volume_ml: vol,
        calculated_mass_mg: mass,
        calculated_volume_ml: vol,
        notes: t.notes,
      };
    })
    .filter(t => t.name.trim() || t.target_concentration_mg_per_ml != null || t.target_volume_ml != null || t.notes.trim());

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
    expiration_date: expDate ?? "",
    storage_condition: v.storage_condition,
    storage_location: v.storage_location,
    container_label: v.container_label,
    notes: v.notes,
    expiration_period_code: v.expiration_period_code,
    expiration_period_days: days,
    initial_solvent: v.initial_solvent,
    final_diluent: v.final_diluent,
    modifier_percent: v.modifier_percent === "" ? null : Number(v.modifier_percent),
    material_overridden: v.material_overridden,
    ref_material_name: v.ref_material_name,
    ref_lot: v.ref_lot,
    ref_purity_percent: purity,
    ref_molecular_weight: v.ref_molecular_weight === "" ? null : Number(v.ref_molecular_weight),
    ref_receipt_date: v.ref_receipt_date || null,
    targets,
  };
}

interface Props {
  initial?: Partial<PrepFormValues>;
  defaultAnalystName: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: PrepFormValues) => void;
  onCancel?: () => void;
  /**
   * If provided, form values are persisted to localStorage under this key and
   * restored on mount. Parent should call `clearPrepDraft(draftKey)` after a
   * successful save.
   */
  draftKey?: string;
}

export function clearPrepDraft(draftKey: string | undefined) {
  if (!draftKey || typeof window === "undefined") return;
  try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
}

function loadDraft(draftKey: string | undefined): Partial<PrepFormValues> | null {
  if (!draftKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey);
    return raw ? (JSON.parse(raw) as Partial<PrepFormValues>) : null;
  } catch { return null; }
}

export function PrepForm({ initial, defaultAnalystName, submitting, submitLabel = "Save", onSubmit, onCancel, draftKey }: Props) {
  const [v, setV] = useState<PrepFormValues>(() => {
    const draft = loadDraft(draftKey);
    return { ...emptyPrepValues(defaultAnalystName), ...initial, ...(draft ?? {}) };
  });
  const dirtyRef = useRef<boolean>(!!loadDraft(draftKey));
  const hasDraft = !!loadDraft(draftKey);
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

  // Persist draft on every change.
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    try { window.localStorage.setItem(draftKey, JSON.stringify(v)); } catch { /* ignore quota */ }
  }, [v, draftKey]);

  // Warn on tab close / refresh while dirty.
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftKey]);

  const suggestionList = useMemo(() => suggestions, [suggestions]);

  function up<K extends keyof PrepFormValues>(k: K, val: PrepFormValues[K]) {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, [k]: val }));
  }

  function pickSuggestion(name: string) {
    if (!name) return;
    const match = suggestionList.find(s => s.name === name);
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      standard_name: name,
      target_concentration: prev.target_concentration || match?.typical_concentration || "",
      solvent: prev.solvent || match?.typical_solvent || "",
    }));
  }

  function linkReceipt(r: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string }) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      material_receipt_id: r.id,
      material_receipt_label: `${r.receipt_number} — ${r.material_name}${r.internal_lot ? ` (lot ${r.internal_lot})` : ""}`,
      manufacturer_lot: prev.manufacturer_lot || r.manufacturer_lot || "",
    }));
    setReceiptPickerOpen(false);
  }

  function clearReceipt() {
    dirtyRef.current = true;
    setV(prev => ({ ...prev, material_receipt_id: "", material_receipt_label: "" }));
  }

  function addStep() {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: [
        ...prev.preparation_steps,
        { step_no: prev.preparation_steps.length + 1, description: "", amount: "", instrument_id: "", time: "" },
      ],
    }));
  }

  function removeStep(idx: number) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_no: i + 1 })),
    }));
  }

  function updateStep(idx: number, patch: Partial<PrepStep>) {
    dirtyRef.current = true;
    setV(prev => ({
      ...prev,
      preparation_steps: prev.preparation_steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  function handleCancel() {
    if (!onCancel) return;
    if (dirtyRef.current && draftKey) {
      const ok = window.confirm("Discard unsaved preparation? Your changes will be lost.");
      if (!ok) return;
      clearPrepDraft(draftKey);
    }
    onCancel();
  }

  function discardDraft() {
    if (!window.confirm("Discard saved draft and start fresh?")) return;
    clearPrepDraft(draftKey);
    dirtyRef.current = false;
    setV({ ...emptyPrepValues(defaultAnalystName), ...initial });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {hasDraft && draftKey && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center justify-between gap-2">
          <span className="text-foreground">Restored unsaved draft. Your changes are auto-saved in this browser until you submit or discard.</span>
          <Button type="button" size="sm" variant="ghost" onClick={discardDraft}>Discard draft</Button>
        </div>
      )}
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
        {onCancel && <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>}
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
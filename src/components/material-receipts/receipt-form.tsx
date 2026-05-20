import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, X } from "lucide-react";
import { listMaterialSuggestions, type MaterialType, type QuarantineStatus, MATERIAL_TYPES, QUARANTINE_STATUSES } from "@/lib/material-receipts.functions";

export interface ReceiptFormValues {
  material_type: MaterialType;
  received_at: string;
  receiver_name: string;
  material_name: string;
  quantity: string;
  unit: string;
  supplier: string;
  po_number: string;
  notes: string;
  freight_tracking_number: string;
  purpose: string;
  manufacturer: string;
  manufacturer_lot: string;
  catalog_number: string;
  expiry_date: string;
  container_details: string;
  coa_attached: boolean;
  sds_attached: boolean;
  visual_inspection: string;
  visual_inspection_notes: string;
  temperature_on_receipt: string;
  internal_lot: string;
  storage_location: string;
  quarantine_status: QuarantineStatus;
  qc_pass: "" | "pass" | "fail";
  qc_results: string;
  qc_analyst: string;
  qc_date: string;
  purity_percent: string;
  molecular_weight: string;
  shelf_life_months: string;
}

export const VISUAL_INSPECTION_OPTIONS = [
  "Pass — no defects",
  "Pass — minor packaging defect",
  "Fail — container damaged",
  "Fail — seal broken",
  "Fail — contamination suspected",
  "Other (see notes)",
];

export function emptyValues(receiverName: string): ReceiptFormValues {
  return {
    material_type: "controlled",
    received_at: new Date().toISOString().slice(0, 16),
    receiver_name: receiverName,
    material_name: "",
    quantity: "",
    unit: "",
    supplier: "",
    po_number: "",
    notes: "",
    freight_tracking_number: "",
    purpose: "",
    manufacturer: "",
    manufacturer_lot: "",
    catalog_number: "",
    expiry_date: "",
    container_details: "",
    coa_attached: false,
    sds_attached: false,
    visual_inspection: "",
    visual_inspection_notes: "",
    temperature_on_receipt: "",
    internal_lot: "",
    storage_location: "",
    quarantine_status: "quarantine",
    qc_pass: "",
    qc_results: "",
    qc_analyst: "",
    qc_date: "",
    purity_percent: "",
    molecular_weight: "",
    shelf_life_months: "",
  };
}

export function valuesToPayload(v: ReceiptFormValues) {
  return {
    material_type: v.material_type,
    received_at: new Date(v.received_at).toISOString(),
    receiver_name: v.receiver_name,
    material_name: v.material_name,
    quantity: v.quantity === "" ? null : Number(v.quantity),
    unit: v.unit,
    supplier: v.supplier,
    po_number: v.po_number,
    notes: v.notes,
    freight_tracking_number: v.freight_tracking_number,
    purpose: v.material_type === "uncontrolled" ? v.purpose : null,
    manufacturer: v.material_type === "controlled" ? v.manufacturer : null,
    manufacturer_lot: v.material_type === "controlled" ? v.manufacturer_lot : null,
    catalog_number: v.material_type === "controlled" ? v.catalog_number : null,
    expiry_date: v.material_type === "controlled" && v.expiry_date ? v.expiry_date : null,
    container_details: v.material_type === "controlled" ? v.container_details : null,
    coa_attached: v.coa_attached,
    sds_attached: v.sds_attached,
    visual_inspection: v.material_type === "controlled" ? v.visual_inspection : null,
    visual_inspection_notes: v.material_type === "controlled" ? v.visual_inspection_notes : null,
    temperature_on_receipt:
      v.material_type === "controlled" && v.temperature_on_receipt !== ""
        ? Number(v.temperature_on_receipt)
        : null,
    internal_lot: v.material_type === "controlled" ? v.internal_lot : null,
    storage_location: v.material_type === "controlled" ? v.storage_location : null,
    quarantine_status: v.material_type === "controlled" ? v.quarantine_status : "released" as const,
    qc_pass: v.qc_pass === "" ? null : v.qc_pass === "pass",
    qc_results: v.material_type === "controlled" ? v.qc_results : null,
    qc_analyst: v.material_type === "controlled" ? v.qc_analyst : null,
    qc_date: v.material_type === "controlled" && v.qc_date ? v.qc_date : null,
    purity_percent:
      v.material_type === "controlled" && v.purity_percent !== ""
        ? Number(v.purity_percent)
        : null,
    molecular_weight:
      v.material_type === "controlled" && v.molecular_weight !== ""
        ? Number(v.molecular_weight)
        : null,
    shelf_life_months:
      v.material_type === "controlled" && v.shelf_life_months !== ""
        ? Number(v.shelf_life_months)
        : null,
  };
}

export interface PendingAttachments {
  coa: File[];
  sds: File[];
}

interface Props {
  initial?: Partial<ReceiptFormValues>;
  defaultReceiverName: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: ReceiptFormValues, pending: PendingAttachments) => void;
  onCancel?: () => void;
}

export function ReceiptForm({ initial, defaultReceiverName, submitting, submitLabel = "Save Receipt", onSubmit, onCancel }: Props) {
  const [v, setV] = useState<ReceiptFormValues>(() => ({ ...emptyValues(defaultReceiverName), ...initial }));
  const [coaFiles, setCoaFiles] = useState<File[]>([]);
  const [sdsFiles, setSdsFiles] = useState<File[]>([]);
  const coaRef = useRef<HTMLInputElement>(null);
  const sdsRef = useRef<HTMLInputElement>(null);
  const listSuggestions = useServerFn(listMaterialSuggestions);
  const { data: suggestions = [] } = useQuery({
    queryKey: ["material-suggestions"],
    queryFn: () => listSuggestions(),
  });

  useEffect(() => {
    if (!initial && !v.receiver_name && defaultReceiverName) {
      setV(prev => ({ ...prev, receiver_name: defaultReceiverName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultReceiverName]);

  const filteredSuggestions = useMemo(
    () => suggestions.filter(s => s.material_type === v.material_type),
    [suggestions, v.material_type],
  );

  function up<K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  function handleSuggestionPick(name: string) {
    if (!name) return;
    const match = filteredSuggestions.find(s => s.name === name);
    setV(prev => ({
      ...prev,
      material_name: name,
      manufacturer: prev.manufacturer || match?.manufacturer || "",
      catalog_number: prev.catalog_number || match?.catalog_number || "",
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const values: ReceiptFormValues = {
      ...v,
      coa_attached: v.coa_attached || coaFiles.length > 0,
      sds_attached: v.sds_attached || sdsFiles.length > 0,
    };
    onSubmit(values, { coa: coaFiles, sds: sdsFiles });
  }

  const isControlled = v.material_type === "controlled";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Material type selector — prominent */}
      <Card className="p-5 border-primary/30">
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">Material Type</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 max-w-md">
          {MATERIAL_TYPES.map(t => (
            <button
              type="button"
              key={t}
              onClick={() => up("material_type", t)}
              className={`px-4 py-3 rounded-md border text-sm font-medium capitalize transition-colors ${
                v.material_type === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {isControlled
            ? "Controlled materials require manufacturer details, COA/SDS, QC review and approval."
            : "Uncontrolled materials use a simplified intake form."}
        </p>
      </Card>

      {/* Common fields */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receipt Details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Date & time of receipt" required>
            <Input type="datetime-local" value={v.received_at} onChange={e => up("received_at", e.target.value)} required />
          </Field>
          <Field label="Receiver's name / initials" required>
            <Input value={v.receiver_name} onChange={e => up("receiver_name", e.target.value)} required maxLength={255} />
          </Field>
          <Field label="Material / Item name" required>
            <Input
              list="material-suggestions"
              value={v.material_name}
              onChange={e => up("material_name", e.target.value)}
              onBlur={e => handleSuggestionPick(e.target.value)}
              required
              maxLength={255}
              placeholder="Start typing…"
            />
            <datalist id="material-suggestions">
              {filteredSuggestions.map(s => <option key={s.id} value={s.name} />)}
            </datalist>
          </Field>
          <Field label="Quantity received">
            <div className="grid grid-cols-3 gap-2">
              <Input className="col-span-2" type="number" step="any" value={v.quantity} onChange={e => up("quantity", e.target.value)} placeholder="0" />
              <Input value={v.unit} onChange={e => up("unit", e.target.value)} placeholder="unit" maxLength={50} />
            </div>
          </Field>
          <Field label="Supplier / Vendor">
            <Input value={v.supplier} onChange={e => up("supplier", e.target.value)} maxLength={255} />
          </Field>
          <Field label="PO / Invoice number">
            <Input value={v.po_number} onChange={e => up("po_number", e.target.value)} maxLength={100} />
          </Field>
        </div>
        <Field label="Notes / comments">
          <Textarea value={v.notes} onChange={e => up("notes", e.target.value)} rows={3} maxLength={4000} />
        </Field>
      </Card>

      {isControlled ? (
        <>
          {/* Manufacturer block */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Manufacturer & Lot</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Manufacturer">
                <Input value={v.manufacturer} onChange={e => up("manufacturer", e.target.value)} maxLength={255} />
              </Field>
              <Field label="Manufacturer batch / lot #">
                <Input value={v.manufacturer_lot} onChange={e => up("manufacturer_lot", e.target.value)} maxLength={100} />
              </Field>
              <Field label="Catalog / part number">
                <Input value={v.catalog_number} onChange={e => up("catalog_number", e.target.value)} maxLength={100} />
              </Field>
              <Field label="Expiry / retest date">
                <Input type="date" value={v.expiry_date} onChange={e => up("expiry_date", e.target.value)} />
              </Field>
              <Field label="Container (size, type, condition)" className="md:col-span-2">
                <Input value={v.container_details} onChange={e => up("container_details", e.target.value)} maxLength={500} />
              </Field>
              <Field label="Purity (%)">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={v.purity_percent}
                  onChange={e => up("purity_percent", e.target.value)}
                  placeholder="e.g. 99.5"
                />
              </Field>
              <Field label="Molecular weight (g/mol)">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={v.molecular_weight}
                  onChange={e => up("molecular_weight", e.target.value)}
                  placeholder="e.g. 1046.18"
                />
              </Field>
              <Field label="Shelf life (months)">
                <Input
                  type="number"
                  step={1}
                  min={0}
                  value={v.shelf_life_months}
                  onChange={e => up("shelf_life_months", e.target.value)}
                  placeholder="e.g. 24"
                />
              </Field>
            </div>
          </Card>

          {/* COA / SDS / Inspection */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Documentation & Tracking</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Freight tracking number" className="md:col-span-2">
                <Input
                  value={v.freight_tracking_number}
                  onChange={e => up("freight_tracking_number", e.target.value)}
                  placeholder="e.g. 1Z999AA10123456784"
                  maxLength={255}
                />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FileSlot
                title="COA (Certificate of Analysis)"
                files={coaFiles}
                existing={v.coa_attached}
                onPick={() => coaRef.current?.click()}
                onRemove={(i) => setCoaFiles(prev => prev.filter((_, idx) => idx !== i))}
              />
              <input
                ref={coaRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setCoaFiles(prev => [...prev, ...files]);
                  e.target.value = "";
                }}
              />
              <FileSlot
                title="SDS (Safety Data Sheet)"
                files={sdsFiles}
                existing={v.sds_attached}
                onPick={() => sdsRef.current?.click()}
                onRemove={(i) => setSdsFiles(prev => prev.filter((_, idx) => idx !== i))}
              />
              <input
                ref={sdsRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setSdsFiles(prev => [...prev, ...files]);
                  e.target.value = "";
                }}
              />
              <Field label="Visual inspection result">
                <Select value={v.visual_inspection} onValueChange={val => up("visual_inspection", val)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {VISUAL_INSPECTION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Temperature on receipt (°C)">
                <Input type="number" step="any" value={v.temperature_on_receipt} onChange={e => up("temperature_on_receipt", e.target.value)} />
              </Field>
              <Field label="Visual inspection notes" className="md:col-span-2">
                <Textarea value={v.visual_inspection_notes} onChange={e => up("visual_inspection_notes", e.target.value)} rows={2} maxLength={2000} />
              </Field>
            </div>
          </Card>

          {/* Internal tracking + QC */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Internal Tracking & QC</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Assigned internal lot / control #">
                <Input value={v.internal_lot} onChange={e => up("internal_lot", e.target.value)} maxLength={100} />
              </Field>
              <Field label="Storage location / condition">
                <Input value={v.storage_location} onChange={e => up("storage_location", e.target.value)} maxLength={255} />
              </Field>
              <Field label="Quarantine status">
                <Select value={v.quarantine_status} onValueChange={val => up("quarantine_status", val as QuarantineStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUARANTINE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="QC pass / fail">
                <Select value={v.qc_pass} onValueChange={val => up("qc_pass", val as "" | "pass" | "fail")}>
                  <SelectTrigger><SelectValue placeholder="Not reviewed" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="QC analyst">
                <Input value={v.qc_analyst} onChange={e => up("qc_analyst", e.target.value)} maxLength={255} />
              </Field>
              <Field label="QC date">
                <Input type="date" value={v.qc_date} onChange={e => up("qc_date", e.target.value)} />
              </Field>
              <Field label="QC results summary" className="md:col-span-2">
                <Textarea value={v.qc_results} onChange={e => up("qc_results", e.target.value)} rows={3} maxLength={2000} />
              </Field>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-5">
          <Field label="Purpose (e.g. general lab use)">
            <Input value={v.purpose} onChange={e => up("purpose", e.target.value)} maxLength={500} />
          </Field>
        </Card>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
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

function FileSlot({
  title,
  files,
  existing,
  onPick,
  onRemove,
}: {
  title: string;
  files: File[];
  existing: boolean;
  onPick: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">
            {existing
              ? "Already attached — add more if needed"
              : files.length === 0
                ? "No file selected"
                : `${files.length} file${files.length === 1 ? "" : "s"} ready to upload`}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onPick}>
          <Paperclip className="size-4 mr-1" /> Add file
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
              <button type="button" onClick={() => onRemove(i)} className="text-destructive hover:opacity-70">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
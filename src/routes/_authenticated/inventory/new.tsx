import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Search, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  createInventoryItem,
  type InventoryCategory,
  type InventoryStatus,
} from "@/lib/inventory.functions";
import { qk } from "@/lib/query-keys";
import { lookupPartNumber } from "@/lib/inventory/part-lookup";

export const Route = createFileRoute("/_authenticated/inventory/new")({
  component: InventoryNew,
});

interface FieldSet {
  make: string;
  model: string;
  serial_number: string;
  description: string;
  purchase_date: string;
  installation_date: string;
  installer_initials: string;
  status: InventoryStatus;
  is_spare: boolean;
}

const EMPTY: FieldSet = {
  make: "", model: "", serial_number: "", description: "",
  purchase_date: "", installation_date: "", installer_initials: "",
  status: "in_use", is_spare: false,
};

const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: "in_use", label: "In use" },
  { value: "working_not_in_use", label: "Working · not in use" },
  { value: "discarded", label: "Discarded" },
];

type LookupState =
  | { kind: "idle" }
  | { kind: "found"; label: string }
  | { kind: "not_found" };

function PartLookup({
  value, onChange, idPrefix,
}: { value: FieldSet; onChange: (v: FieldSet) => void; idPrefix: string }) {
  const [pn, setPn] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });

  const runSearch = () => {
    const q = pn.trim();
    if (!q) return;
    const result = lookupPartNumber(q);
    if (result.source === "none") {
      // Seed model with what they typed so manual entry is faster.
      onChange({ ...value, model: value.model || q });
      setState({ kind: "not_found" });
      return;
    }
    onChange({
      ...value,
      make: result.values.make,
      model: result.values.model,
      description: result.values.description,
    });
    setState({ kind: "found", label: result.label });
  };

  return (
    <div className="space-y-2 p-3 rounded-md border border-dashed bg-muted/30">
      <Label htmlFor={`${idPrefix}-pn-search`} className="text-xs uppercase tracking-wider">
        Search part database
      </Label>
      <div className="flex gap-2">
        <Input
          id={`${idPrefix}-pn-search`}
          value={pn}
          onChange={e => { setPn(e.target.value); setState({ kind: "idle" }); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
          placeholder="Enter part number (e.g. 959963-902)"
          className="font-mono"
        />
        <Button type="button" variant="secondary" onClick={runSearch}>
          <Search className="size-4 mr-1" /> Search
        </Button>
      </div>
      {state.kind === "found" && (
        <div className="flex items-center justify-between gap-2 text-sm text-green-700 dark:text-green-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> Match found · {state.label} · fields auto-filled
          </span>
          <Button
            type="button" size="sm" variant="ghost"
            onClick={() => {
              onChange({ ...value, make: "", model: "", description: "" });
              setState({ kind: "idle" });
              setPn("");
            }}
          >
            <X className="size-3 mr-1" /> Clear
          </Button>
        </div>
      )}
      {state.kind === "not_found" && (
        <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="size-4" /> Not found — enter the details manually below
        </div>
      )}
    </div>
  );
}

function FieldGrid({
  value, onChange, idPrefix,
}: { value: FieldSet; onChange: (v: FieldSet) => void; idPrefix: string }) {
  const set = <K extends keyof FieldSet>(k: K, v: FieldSet[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <PartLookup value={value} onChange={onChange} idPrefix={idPrefix} />
      <div className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
        <div>
          <Label htmlFor={`${idPrefix}-spare`} className="cursor-pointer">Spare inventory</Label>
          <p className="text-xs text-muted-foreground">Stocked spare — installation date and installer initials not required.</p>
        </div>
        <Switch
          id={`${idPrefix}-spare`}
          checked={value.is_spare}
          onCheckedChange={c => onChange({
            ...value,
            is_spare: c,
            installation_date: c ? "" : value.installation_date,
            installer_initials: c ? "" : value.installer_initials,
          })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-make`}>Make</Label>
          <Input id={`${idPrefix}-make`} value={value.make} onChange={e => set("make", e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-model`}>Model</Label>
          <Input id={`${idPrefix}-model`} value={value.model} onChange={e => set("model", e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-serial`}>Serial number</Label>
          <Input id={`${idPrefix}-serial`} value={value.serial_number} onChange={e => set("serial_number", e.target.value)} />
        </div>
        {!value.is_spare && (
          <div>
            <Label htmlFor={`${idPrefix}-initials`}>Installer initials</Label>
            <Input id={`${idPrefix}-initials`} value={value.installer_initials} onChange={e => set("installer_initials", e.target.value.toUpperCase())} maxLength={10} />
          </div>
        )}
        <div>
          <Label htmlFor={`${idPrefix}-purchase`}>Purchase date</Label>
          <Input id={`${idPrefix}-purchase`} type="date" value={value.purchase_date} onChange={e => set("purchase_date", e.target.value)} />
        </div>
        {!value.is_spare && (
          <div>
            <Label htmlFor={`${idPrefix}-install`}>Installation date</Label>
            <Input id={`${idPrefix}-install`} type="date" value={value.installation_date} onChange={e => set("installation_date", e.target.value)} />
          </div>
        )}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-desc`}>Description</Label>
        <Textarea id={`${idPrefix}-desc`} rows={2} value={value.description} onChange={e => set("description", e.target.value)} />
      </div>
      <div>
        <Label className="mb-2 block">Status</Label>
        <RadioGroup
          value={value.status}
          onValueChange={v => set("status", v as InventoryStatus)}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {STATUS_OPTIONS.map(opt => (
            <Label
              key={opt.value}
              htmlFor={`${idPrefix}-status-${opt.value}`}
              className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50"
            >
              <RadioGroupItem id={`${idPrefix}-status-${opt.value}`} value={opt.value} />
              <span className="text-sm">{opt.label}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

function InventoryNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createInventoryItem);

  const [category, setCategory] = useState<InventoryCategory>("instrument");
  const [main, setMain] = useState<FieldSet>(EMPTY);
  const [components, setComponents] = useState<FieldSet[]>([]);

  const supportsComponents = category === "instrument" || category === "other";

  const mutation = useMutation({
    mutationFn: () => create({
      data: {
        category,
        ...main,
        components: supportsComponents ? components : [],
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.inventory.all });
      toast.success("Inventory added");
      navigate({ to: "/inventory" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/inventory"><ArrowLeft className="size-4 mr-1" /> Back to inventory</Link>
      </Button>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Add inventory</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Record a new lab asset. Instruments and "other" can also include sub-components.
      </p>

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(); }}
        className="space-y-6"
      >
        <Card className="p-4 sm:p-6 space-y-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={v => setCategory(v as InventoryCategory)}>
              <SelectTrigger id="category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instrument">Instrument</SelectItem>
                <SelectItem value="column">Column</SelectItem>
                <SelectItem value="accessory">Accessory</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <FieldGrid value={main} onChange={setMain} idPrefix="main" />
        </Card>

        {supportsComponents && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Components</h2>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setComponents(prev => [...prev, { ...EMPTY }])}
              >
                <Plus className="size-4 mr-1" /> Add component
              </Button>
            </div>
            {components.length === 0 && (
              <p className="text-sm text-muted-foreground">No components added.</p>
            )}
            {components.map((c, idx) => (
              <Card key={idx} className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Component {idx + 1}</div>
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => setComponents(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <FieldGrid
                  value={c}
                  onChange={v => setComponents(prev => prev.map((row, i) => (i === idx ? v : row)))}
                  idPrefix={`comp-${idx}`}
                />
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory">Cancel</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save inventory"}
          </Button>
        </div>
      </form>
    </div>
  );
}
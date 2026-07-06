/**
 * Shared form bits for inventory: per-item field set, status options,
 * and the FieldGrid component used by both create and edit pages.
 */
import { useState } from "react";
import { Search, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { InventoryStatus } from "@/lib/inventory.functions";
import { lookupPartNumber } from "@/lib/inventory/part-lookup";

export interface FieldSet {
  id?: string;
  make: string;
  model: string;
  part_number: string;
  serial_number: string;
  description: string;
  purchase_date: string;
  installation_date: string;
  installer_initials: string;
  status: InventoryStatus;
  is_spare: boolean;
}

export const EMPTY: FieldSet = {
  make: "", model: "", part_number: "", serial_number: "", description: "",
  purchase_date: "", installation_date: "", installer_initials: "",
  status: "in_service", is_spare: false,
};

export const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: "in_service", label: "In service" },
  { value: "out_of_service", label: "Out of service" },
  { value: "discarded", label: "Discarded" },
];

export const STATUS_LABEL: Record<InventoryStatus, string> = {
  in_service: "In service",
  out_of_service: "Out of service",
  discarded: "Discarded",
};

export const STATUS_VARIANT: Record<InventoryStatus, "default" | "secondary" | "outline"> = {
  in_service: "default",
  out_of_service: "secondary",
  discarded: "outline",
};

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
      onChange({ ...value, part_number: value.part_number || q, model: value.model || q });
      setState({ kind: "not_found" });
      return;
    }
    onChange({
      ...value,
      make: result.values.make,
      model: result.values.model,
      part_number: q,
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

export function FieldGrid({
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
          <Label htmlFor={`${idPrefix}-partnumber`}>Part number</Label>
          <Input id={`${idPrefix}-partnumber`} value={value.part_number} onChange={e => set("part_number", e.target.value)} className="font-mono" />
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
        <Label className="mb-2 block">Service status</Label>
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
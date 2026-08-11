/**
 * Editable row for a single compound / lot inside the CoC form. Renders all
 * per-sample fields, the requested-test chip selector, and per-row photo
 * upload + camera capture controls.
 */
import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, X, ImageIcon } from "lucide-react";
import { CompoundPicker, type CompoundOption } from "@/components/compounds/compound-picker";
import type { LineItem } from "./types";

export const CONTAINER_SIZES = ["2 mL", "5 mL", "10 mL", "20 mL", "30 mL"] as const;

export function LineItemRow({
  li, disabled, onChange, testOptions, compoundOptions, onCreateCompound, pendingFiles, onAddFiles, onRemoveFile,
}: {
  li: LineItem;
  disabled: boolean;
  onChange: (patch: Partial<LineItem>) => void;
  testOptions: { id: string; name: string }[];
  compoundOptions: CompoundOption[];
  onCreateCompound: (name: string) => Promise<CompoundOption>;
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (idx: number) => void;
}) {
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  function toggleTest(name: string) {
    const set = new Set(li.requested_tests ?? []);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange({ requested_tests: Array.from(set) });
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div className="sm:col-span-2">
        <Label className="text-[10px] uppercase text-muted-foreground">Product / Compound *</Label>
        <div className="mt-1">
          <CompoundPicker
            options={compoundOptions}
            value={{ compound_id: li.compound_id, name: li.compound }}
            onChange={(v) => onChange({ compound_id: v.compound_id, compound: v.name })}
            onCreateCompound={onCreateCompound}
            disabled={disabled}
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground"># of Vials</Label>
        <Input type="number" min={1} max={99} className="h-8 mt-1" value={li.vial_count} disabled={disabled}
          onChange={e => onChange({ vial_count: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Lot / Batch</Label>
        <Input className="h-8 mt-1" value={li.lot} disabled={disabled}
          onChange={e => onChange({ lot: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Catalog #</Label>
        <Input className="h-8 mt-1" value={li.catalog} disabled={disabled}
          onChange={e => onChange({ catalog: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Manufacturer</Label>
        <Input className="h-8 mt-1" value={li.manufacturer} disabled={disabled}
          onChange={e => onChange({ manufacturer: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Manufacture Date</Label>
        <Input type="date" className="h-8 mt-1" value={li.manufacture_date} disabled={disabled}
          onChange={e => onChange({ manufacture_date: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Client Received Date</Label>
        <Input type="date" className="h-8 mt-1" value={li.client_received_date} disabled={disabled}
          onChange={e => onChange({ client_received_date: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Qty / vial</Label>
        <Input className="h-8 mt-1" value={li.quantity} disabled={disabled} placeholder="e.g. 5"
          onChange={e => onChange({ quantity: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Unit</Label>
        <Input className="h-8 mt-1" value={li.quantity_unit} disabled={disabled} placeholder="mg, mL…"
          onChange={e => onChange({ quantity_unit: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Container size</Label>
        <Select value={li.container_size || undefined} disabled={disabled}
          onValueChange={(v) => onChange({ container_size: v })}>
          <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {CONTAINER_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Concentration / vial</Label>
        <Input className="h-8 mt-1" value={li.concentration} disabled={disabled} placeholder="e.g. 1 mg/mL"
          onChange={e => onChange({ concentration: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Physical form</Label>
        <Select value={li.received_form || undefined} disabled={disabled}
          onValueChange={(v) => onChange({ received_form: v as "lyophilized" | "solution" })}>
          <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lyophilized">Solid / lyophilized</SelectItem>
            <SelectItem value="solution">Solution / liquid</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Purity (%, if solid)</Label>
        <Input type="number" step="0.1" min={0} max={100} className="h-8 mt-1" value={li.received_purity_percent} disabled={disabled}
          placeholder="e.g. 98.5"
          onChange={e => onChange({ received_purity_percent: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Temperature (°C)</Label>
        <Input type="number" step="0.1" className="h-8 mt-1" value={li.temperature_c} disabled={disabled}
          placeholder="e.g. -20"
          onChange={e => onChange({ temperature_c: e.target.value })} />
      </div>
      <div className="sm:col-span-3">
        <Label className="text-[10px] uppercase text-muted-foreground">Storage</Label>
        <Input className="h-8 mt-1" value={li.storage} disabled={disabled}
          onChange={e => onChange({ storage: e.target.value })} />
      </div>
      <div className="sm:col-span-3">
        <Label className="text-[10px] uppercase text-muted-foreground">
          Physical Description (lyophilized powder, liquid, color, etc.)
        </Label>
        <Textarea rows={2} className="mt-1" value={li.physical_description} disabled={disabled}
          onChange={e => onChange({ physical_description: e.target.value })} />
      </div>

      <div className="sm:col-span-3">
        <Label className="text-[10px] uppercase text-muted-foreground">
          Requested tests for this compound
        </Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {testOptions.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No tests configured. Add some in Admin → Test Parameters.</span>
          ) : testOptions.map(t => {
            const active = (li.requested_tests ?? []).includes(t.name);
            return (
              <button
                key={t.id} type="button" disabled={disabled}
                onClick={() => toggleTest(t.name)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-primary/50"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {!disabled && (
        <div className="sm:col-span-3">
          <Label className="text-[10px] uppercase text-muted-foreground">Photos for this compound</Label>
          <div className="flex gap-2 mt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
              <Upload className="size-3.5 mr-1" /> Upload
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
              <Camera className="size-3.5 mr-1" /> Take photo
            </Button>
            <input ref={uploadRef} type="file" accept="image/*" multiple hidden
              onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
          </div>
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs">
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <button type="button" onClick={() => onRemoveFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
/**
 * Editable row for a single received product inside the CoC form. A top-level
 * Solid / Liquid / Capsule selector picks which fields apply, and a
 * multi-component toggle lets a blended product (e.g. "KLOW" = BPC-157 +
 * TB-500 + KPV + GHK-Cu) capture every compound's own label content.
 */
import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, X, ImageIcon, Plus, Trash2 } from "lucide-react";
import { CompoundPicker, type CompoundOption } from "@/components/compounds/compound-picker";
import { emptyLineComponent, type LineItem, type LineItemComponent } from "./types";

export const CONTAINER_SIZES = ["2 mL", "3 mL", "5 mL", "10 mL", "20 mL", "30 mL"] as const;
const LABEL_CONTENT_UNITS = [
  { value: "mg", label: "mg" },
  { value: "ug", label: "µg" },
] as const;

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
  // Local draft text for # of Vials so the field can be cleared and retyped
  // normally. Committing a coerced number on every keystroke (including the
  // empty intermediate state) forced the controlled input back to "1" before
  // a replacement digit could be typed, so clearing only ever "worked" by
  // typing in front and backspacing the old digit out from behind it.
  const [vialCountText, setVialCountText] = React.useState(String(li.vial_count));
  React.useEffect(() => { setVialCountText(String(li.vial_count)); }, [li.vial_count]);
  function toggleTest(name: string) {
    const set = new Set(li.requested_tests ?? []);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange({ requested_tests: Array.from(set) });
  }

  function updateComponent(idx: number, patch: Partial<LineItemComponent>) {
    onChange({ components: li.components.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  }
  function addComponent() {
    onChange({ components: [...li.components, emptyLineComponent()] });
  }
  function removeComponent(idx: number) {
    onChange({ components: li.components.filter((_, i) => i !== idx) });
  }
  function setMultiComponent(v: boolean) {
    onChange({
      is_multi_component: v,
      components: v ? (li.components.length ? li.components : [emptyLineComponent()]) : [],
    });
  }

  const labelContentField = (
    value: string, unit: LineItem["label_content_unit"],
    onValue: (v: string) => void, onUnit: (v: LineItem["label_content_unit"]) => void,
    placeholder?: string,
  ) => (
    <div className="flex gap-1">
      <Input type="number" step="0.01" min={0} className="h-8" value={value} disabled={disabled}
        placeholder={placeholder ?? "Amount"} onChange={e => onValue(e.target.value)} />
      <Select value={unit || undefined} disabled={disabled} onValueChange={(v) => onUnit(v as LineItem["label_content_unit"])}>
        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="Unit" /></SelectTrigger>
        <SelectContent>
          {LABEL_CONTENT_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Physical Form *</Label>
          <Select
            value={li.physical_form || undefined}
            disabled={disabled}
            onValueChange={(v) => onChange({ physical_form: v as LineItem["physical_form"] })}
          >
            <SelectTrigger className="h-8 mt-1 w-36"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="liquid">Liquid</SelectItem>
              <SelectItem value="capsule">Capsule</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground pb-1.5">
          <Checkbox checked={li.is_multi_component} disabled={disabled}
            onCheckedChange={(v) => setMultiComponent(!!v)} />
          Multi-component product (blend)
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase text-muted-foreground">
            {li.is_multi_component ? "Primary Compound *" : "Product / Compound *"}
          </Label>
          <div className="mt-1">
            <CompoundPicker
              options={compoundOptions}
              value={{ compound_id: li.compound_id, name: li.compound }}
              onChange={(v) => onChange({ compound_id: v.compound_id, compound: v.name })}
              onCreateCompound={onCreateCompound}
              disabled={disabled}
            />
            {li.partner_reported_name && li.partner_reported_name !== li.compound && (
              <p className="text-[10px] text-amber-600 mt-1">
                Partner said: &ldquo;{li.partner_reported_name}&rdquo;
              </p>
            )}
          </div>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground"># of Vials</Label>
          <Input type="number" min={1} max={99} className="h-8 mt-1" value={vialCountText} disabled={disabled}
            onChange={e => {
              const raw = e.target.value;
              setVialCountText(raw);
              const n = parseInt(raw, 10);
              if (raw !== "" && Number.isFinite(n) && n >= 1 && n <= 99) onChange({ vial_count: n });
            }}
            onBlur={() => {
              const n = Math.max(1, Math.min(99, parseInt(vialCountText, 10) || 1));
              setVialCountText(String(n));
              onChange({ vial_count: n });
            }} />
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

        {li.physical_form === "solid" && (
          <>
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
              <Label className="text-[10px] uppercase text-muted-foreground">Label Content</Label>
              <div className="mt-1">
                {labelContentField(
                  li.label_content_value, li.label_content_unit,
                  (v) => onChange({ label_content_value: v }),
                  (v) => onChange({ label_content_unit: v }),
                  "e.g. 10",
                )}
              </div>
            </div>
          </>
        )}

        {li.physical_form === "liquid" && (
          <>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Bottle Size</Label>
              <Input className="h-8 mt-1" value={li.bottle_size} disabled={disabled} placeholder="e.g. 10 mL"
                onChange={e => onChange({ bottle_size: e.target.value })} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Volume in Bottle (mL)</Label>
              <Input type="number" step="0.1" min={0} className="h-8 mt-1" value={li.liquid_volume_ml} disabled={disabled}
                onChange={e => onChange({ liquid_volume_ml: e.target.value })} />
            </div>
            <div className="sm:col-span-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Label Content</Label>
              <div className="mt-1 flex gap-1">
                {labelContentField(
                  li.label_content_value, li.label_content_unit,
                  (v) => onChange({ label_content_value: v }),
                  (v) => onChange({ label_content_unit: v }),
                  "e.g. 5",
                )}
                <Select value={li.label_content_basis || undefined} disabled={disabled}
                  onValueChange={(v) => onChange({ label_content_basis: v as LineItem["label_content_basis"] })}>
                  <SelectTrigger className="h-8 w-28"><SelectValue placeholder="Per…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_ml">per mL</SelectItem>
                    <SelectItem value="per_bottle">per bottle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {li.physical_form === "capsule" && (
          <>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Label Content (per capsule)</Label>
              <div className="mt-1">
                {labelContentField(
                  li.label_content_value, li.label_content_unit,
                  (v) => onChange({ label_content_value: v }),
                  (v) => onChange({ label_content_unit: v }),
                  "e.g. 500",
                )}
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground"># of Capsules</Label>
              <Input type="number" min={1} className="h-8 mt-1" value={li.capsule_count} disabled={disabled}
                onChange={e => onChange({ capsule_count: e.target.value })} />
            </div>
          </>
        )}

        {li.is_multi_component && (
          <div className="sm:col-span-3 space-y-2 rounded-md border border-dashed border-border p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase text-muted-foreground">Additional Compounds in Blend</Label>
              {!disabled && (
                <Button type="button" size="sm" variant="outline" onClick={addComponent}>
                  <Plus className="size-3.5 mr-1" /> Add compound
                </Button>
              )}
            </div>
            {li.components.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No additional compounds yet — click “Add compound.”</p>
            )}
            {li.components.map((c, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <CompoundPicker
                    options={compoundOptions}
                    value={{ compound_id: c.compound_id, name: c.compound }}
                    onChange={(v) => updateComponent(idx, { compound_id: v.compound_id, compound: v.name })}
                    onCreateCompound={onCreateCompound}
                    disabled={disabled}
                  />
                </div>
                <div className="w-40">
                  {labelContentField(
                    c.label_content_value, c.label_content_unit,
                    (v) => updateComponent(idx, { label_content_value: v }),
                    (v) => updateComponent(idx, { label_content_unit: v }),
                  )}
                </div>
                {!disabled && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeComponent(idx)}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="sm:col-span-3">
          <Label className="text-[10px] uppercase text-muted-foreground">
            Physical Description (color, appearance, etc.)
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
    </div>
  );
}

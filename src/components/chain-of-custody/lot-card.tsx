/**
 * Level 2 of the intake hierarchy: one product/lot within a shipment.
 * Everything captured here applies to every vial nested under it -- lot,
 * compounds and masses, appearance, vial size, label content -- so it is
 * entered exactly once instead of being retyped per vial the way the old
 * flat line-item form required.
 *
 * Visual weight sits between the shipment header (level 1) and the vial
 * rows (level 3, vial-row.tsx); the nesting is the point.
 */
import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { CompoundPicker, type CompoundOption } from "@/components/compounds/compound-picker";
import {
  APPEARANCE_COLORS, APPEARANCE_TEXTURES, TEST_TYPE_LABEL,
  composeAppearance, vialBatchId, type TestType,
} from "@/lib/lims/sample-hierarchy";
import { emptyLineComponent, emptyVial, type LotRow, type LineItemComponent, type VialRow } from "./types";
import { VialRowEditor } from "./vial-row";

export const CONTAINER_SIZES = ["2 mL", "3 mL", "5 mL", "10 mL", "20 mL", "30 mL"] as const;
const LABEL_CONTENT_UNITS = [
  { value: "mg", label: "mg" },
  { value: "ug", label: "µg" },
] as const;
const TEST_TYPES: TestType[] = ["purity", "sterility", "endotoxin", "heavy_metals"];

export function LotCard({
  lot, lotNo, shipmentId, disabled, onChange, onRemove, canRemove,
  compoundOptions, onCreateCompound,
}: {
  lot: LotRow;
  lotNo: number;
  shipmentId: string;
  disabled: boolean;
  onChange: (patch: Partial<LotRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  compoundOptions: CompoundOption[];
  onCreateCompound: (name: string) => Promise<CompoundOption>;
}) {
  const lotId = `${shipmentId}-${String(lotNo).padStart(2, "0")}`;
  const isLiquid = lot.physical_form === "liquid";
  const appearance = composeAppearance(
    lot.physical_form, lot.appearance_color, lot.appearance_texture, lot.appearance_texture_other,
  );

  function updateComponent(idx: number, patch: Partial<LineItemComponent>) {
    onChange({ components: lot.components.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  }
  function updateVial(idx: number, patch: Partial<VialRow>) {
    onChange({ vials: lot.vials.map((v, i) => (i === idx ? { ...v, ...patch } : v)) });
  }

  /** Count of vials currently assigned to a given test. */
  const countFor = (t: TestType) => lot.vials.filter((v) => v.test_type === t).length;

  /**
   * Adjusts how many vials exist for one test. Vials stay grouped by test in
   * the order they were added, so the generated -01/-02/-03 numbering runs
   * continuously across tests within the lot.
   */
  function setCountFor(t: TestType, next: number) {
    const current = countFor(t);
    if (next === current) return;
    if (next > current) {
      onChange({ vials: [...lot.vials, ...Array.from({ length: next - current }, () => emptyVial(t))] });
      return;
    }
    let toDrop = current - next;
    const kept: VialRow[] = [];
    // Drop from the end of that test's run, leaving other tests untouched.
    for (let i = lot.vials.length - 1; i >= 0; i--) {
      const v = lot.vials[i];
      if (v.test_type === t && toDrop > 0) { toDrop--; continue; }
      kept.unshift(v);
    }
    onChange({ vials: kept });
  }

  const labelContentField = (
    value: string, unit: LotRow["label_content_unit"],
    onValue: (v: string) => void, onUnit: (v: LotRow["label_content_unit"]) => void,
    placeholder?: string,
  ) => (
    <div className="flex gap-1">
      <Input type="number" step="0.01" min={0} className="h-8" value={value} disabled={disabled}
        placeholder={placeholder ?? "Amount"} onChange={(e) => onValue(e.target.value)} />
      <Select value={unit || undefined} disabled={disabled} onValueChange={(v) => onUnit(v as LotRow["label_content_unit"])}>
        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="Unit" /></SelectTrigger>
        <SelectContent>
          {LABEL_CONTENT_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="rounded-lg border-2 border-primary/25 bg-primary/[0.03] overflow-hidden">
      {/* Level-2 header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20">
        <span className="font-mono text-xs font-bold">{lotId}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Lot / Product</span>
        {lot.customer_lot && (
          <span className="font-mono text-[11px] text-muted-foreground">· {lot.customer_lot}</span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {lot.vials.length} vial{lot.vials.length === 1 ? "" : "s"}
        </span>
        {!disabled && canRemove && (
          <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <div className="p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Physical Form *</Label>
            <Select value={lot.physical_form || undefined} disabled={disabled}
              onValueChange={(v) => onChange({ physical_form: v as LotRow["physical_form"] })}>
              <SelectTrigger className="h-8 mt-1 w-36"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="liquid">Liquid</SelectItem>
                <SelectItem value="capsule">Capsule</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-1.5">
            <Checkbox checked={lot.is_multi_component} disabled={disabled}
              onCheckedChange={(v) => onChange({
                is_multi_component: !!v,
                components: v ? (lot.components.length ? lot.components : [emptyLineComponent()]) : [],
              })} />
            Multi-component product (blend)
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">
              {lot.is_multi_component ? "Primary Compound *" : "Product / Compound *"}
            </Label>
            <div className="mt-1">
              <CompoundPicker
                options={compoundOptions}
                value={{ compound_id: lot.compound_id, name: lot.compound }}
                onChange={(v) => {
                  const opt = compoundOptions.find((o) => o.id === v.compound_id);
                  onChange({ compound_id: v.compound_id, compound: v.name, ...(!lot.appearance_color && opt?.default_appearance ? {} : {}) });
                }}
                onCreateCompound={onCreateCompound}
                disabled={disabled}
              />
              {lot.partner_reported_name && lot.partner_reported_name !== lot.compound && (
                <p className="text-[10px] text-amber-600 mt-1">Partner said: &ldquo;{lot.partner_reported_name}&rdquo;</p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Client Lot / Batch</Label>
            <Input className="h-8 mt-1 font-mono text-xs" value={lot.customer_lot} disabled={disabled}
              onChange={(e) => onChange({ customer_lot: e.target.value })} />
          </div>

          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Catalog #</Label>
            <Input className="h-8 mt-1" value={lot.catalog} disabled={disabled}
              onChange={(e) => onChange({ catalog: e.target.value })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Manufacturer</Label>
            <Input className="h-8 mt-1" value={lot.manufacturer} disabled={disabled}
              onChange={(e) => onChange({ manufacturer: e.target.value })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Container Size</Label>
            <Select value={lot.container_size || undefined} disabled={disabled}
              onValueChange={(v) => onChange({ container_size: v })}>
              <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {CONTAINER_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Manufacture Date</Label>
            <Input type="date" className="h-8 mt-1" value={lot.manufacture_date} disabled={disabled}
              onChange={(e) => onChange({ manufacture_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Client Received Date</Label>
            <Input type="date" className="h-8 mt-1" value={lot.client_received_date} disabled={disabled}
              onChange={(e) => onChange({ client_received_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">
              Label Content{isLiquid ? " (per mL)" : lot.physical_form === "capsule" ? " (per capsule)" : ""}
            </Label>
            <div className="mt-1">
              {labelContentField(
                lot.label_content_value, lot.label_content_unit,
                (v) => onChange({ label_content_value: v }),
                (v) => onChange({ label_content_unit: v }),
              )}
            </div>
          </div>
        </div>

        {/* Appearance -- entered once, applies to every vial below */}
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Appearance (applies to all vials in this lot)</Label>
            {appearance && <span className="text-xs font-medium">{appearance}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Color</Label>
              <Select value={lot.appearance_color || undefined} disabled={disabled}
                onValueChange={(v) => onChange({ appearance_color: v })}>
                <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {APPEARANCE_COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Liquids are just liquid -- no texture to record. */}
            {!isLiquid && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Texture / Prep</Label>
                <Select value={lot.appearance_texture || undefined} disabled={disabled}
                  onValueChange={(v) => onChange({ appearance_texture: v })}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {APPEARANCE_TEXTURES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isLiquid && lot.appearance_texture === "Other" && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Describe</Label>
                <Input className="h-8 mt-1" value={lot.appearance_texture_other} disabled={disabled}
                  placeholder="e.g. crystalline" onChange={(e) => onChange({ appearance_texture_other: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        {lot.is_multi_component && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase text-muted-foreground">Additional Compounds in Blend</Label>
              {!disabled && (
                <Button type="button" size="sm" variant="outline"
                  onClick={() => onChange({ components: [...lot.components, emptyLineComponent()] })}>
                  <Plus className="size-3.5 mr-1" /> Add compound
                </Button>
              )}
            </div>
            {lot.components.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No additional compounds yet.</p>
            )}
            {lot.components.map((c, idx) => (
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
                  <Button type="button" size="icon" variant="ghost"
                    onClick={() => onChange({ components: lot.components.filter((_, i) => i !== idx) })}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Notes for this lot</Label>
          <Textarea rows={2} className="mt-1" value={lot.notes} disabled={disabled}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>

        {/* Level 3 -- how many vials of each test, then the vials themselves */}
        <div className="rounded-md border border-border bg-background/30 p-2.5 space-y-2.5">
          <Label className="text-[10px] uppercase text-muted-foreground">Test Vials</Label>
          <div className="flex flex-wrap gap-3">
            {TEST_TYPES.map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{TEST_TYPE_LABEL[t]}</span>
                <Input
                  type="number" min={0} max={20} disabled={disabled}
                  className="h-7 w-14 text-center"
                  value={countFor(t)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n <= 20) setCountFor(t, n);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {lot.vials.map((v, idx) => (
              <VialRowEditor
                key={idx}
                vial={v}
                vialId={vialBatchId(shipmentId, lotNo, idx + 1)}
                disabled={disabled}
                lotAppearance={appearance}
                onChange={(patch) => updateVial(idx, patch)}
                onRemove={() => onChange({ vials: lot.vials.filter((_, i) => i !== idx) })}
                canRemove={lot.vials.length > 1}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

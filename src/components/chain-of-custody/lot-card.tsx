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
  composeAppearance, vialBatchId, lotDisplayName, totalLabelContentMg,
  sortVialsByTest, TEST_ORDER, type TestType,
} from "@/lib/lims/sample-hierarchy";
import { emptyLineComponent, emptyVial, type LotRow, type LineItemComponent, type VialRow } from "./types";
import { VialRowEditor } from "./vial-row";

export const CONTAINER_SIZES = ["2 mL", "3 mL", "5 mL", "10 mL", "20 mL", "30 mL"] as const;
const LABEL_CONTENT_UNITS = [
  { value: "mg", label: "mg" },
  { value: "ug", label: "µg" },
] as const;
// Rendered in canonical order so the counters read the same way the
// vials end up numbered.
const TEST_TYPES: TestType[] = TEST_ORDER;

/**
 * Each lot in a shipment gets its own accent, cycling through this list.
 * The colour carries one meaning only -- "which product am I looking at" --
 * so that scanning a long receipt you can tell where one compound's block
 * ends and the next begins without reading anything. Applied structurally
 * (thick left spine + header band), which keeps it distinct from the small
 * per-test pills inside the vial rows.
 */
const LOT_ACCENTS = [
  { spine: "bg-sky-400",     band: "bg-sky-400/15",     ring: "border-sky-400/45",     ink: "text-sky-200" },
  { spine: "bg-emerald-400", band: "bg-emerald-400/15", ring: "border-emerald-400/45", ink: "text-emerald-200" },
  { spine: "bg-fuchsia-400", band: "bg-fuchsia-400/15", ring: "border-fuchsia-400/45", ink: "text-fuchsia-200" },
  { spine: "bg-orange-400",  band: "bg-orange-400/15",  ring: "border-orange-400/45",  ink: "text-orange-200" },
  { spine: "bg-cyan-400",    band: "bg-cyan-400/15",    ring: "border-cyan-400/45",    ink: "text-cyan-200" },
  { spine: "bg-lime-400",    band: "bg-lime-400/15",    ring: "border-lime-400/45",    ink: "text-lime-200" },
] as const;

export function lotAccent(lotNo: number) {
  return LOT_ACCENTS[(lotNo - 1) % LOT_ACCENTS.length];
}

export function LotCard({
  lot, lotNo, shipmentId, disabled, onChange, onRemove, canRemove,
  compoundOptions, onCreateCompound, photosByVial, onAddVialPhotos, onRemoveVialPhoto,
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
  /** Pending per-vial photos for THIS lot, keyed by 0-based vial index. */
  photosByVial: Record<number, File[]>;
  onAddVialPhotos: (vialIdx: number, files: File[]) => void;
  onRemoveVialPhoto: (vialIdx: number, fileIdx: number) => void;
}) {
  const lotId = `${shipmentId}-${String(lotNo).padStart(2, "0")}`;
  const isLiquid = lot.physical_form === "liquid";
  // Both derived, never stored as entered values: the product's name is the
  // marketing name or a join of its compounds, and its label content is the
  // sum of every component's amount.
  const productName = lotDisplayName(lot.display_name, lot.components);
  const totalMg = totalLabelContentMg(lot.components);
  const appearance = composeAppearance(
    lot.physical_form, lot.appearance_color, lot.appearance_texture, lot.appearance_texture_other,
  );

  function updateComponent(idx: number, patch: Partial<LineItemComponent>) {
    onChange({ components: lot.components.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  }
  function updateVial(idx: number, patch: Partial<VialRow>) {
    const next = lot.vials.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    // Re-sort on a test change so numbering stays grouped by test.
    onChange({ vials: patch.test_type ? sortVialsByTest(next) : next });
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
      onChange({ vials: sortVialsByTest([...lot.vials, ...Array.from({ length: next - current }, () => emptyVial(t))]) });
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
    onChange({ vials: sortVialsByTest(kept) });
  }

  const labelContentField = (
    value: string, unit: LineItemComponent["label_content_unit"],
    onValue: (v: string) => void, onUnit: (v: LineItemComponent["label_content_unit"]) => void,
    placeholder?: string,
  ) => (
    <div className="flex gap-1">
      <Input type="number" step="0.01" min={0} className="h-8" value={value} disabled={disabled}
        placeholder={placeholder ?? "Amount"} onChange={(e) => onValue(e.target.value)} />
      <Select value={unit || undefined} disabled={disabled} onValueChange={(v) => onUnit(v as LineItemComponent["label_content_unit"])}>
        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="Unit" /></SelectTrigger>
        <SelectContent>
          {LABEL_CONTENT_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const accent = lotAccent(lotNo);

  return (
    <div className={`relative rounded-lg border-2 ${accent.ring} bg-card shadow-sm overflow-hidden`}>
      {/* Thick colour spine down the whole card -- the main "this block is
          one product" cue when scanning a long receipt. */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent.spine}`} aria-hidden />

      {/* Level-2 header */}
      <div className={`flex flex-wrap items-center gap-2 pl-5 pr-3 py-2.5 ${accent.band} border-b-2 ${accent.ring}`}>
        <span className={`font-mono text-sm font-bold ${accent.ink}`}>{lotId}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Lot {lotNo}</span>
        {productName && <span className="text-xs font-semibold">· {productName}</span>}
        {lot.customer_lot && (
          <span className="font-mono text-[11px] text-muted-foreground">· {lot.customer_lot}</span>
        )}
        <div className="flex-1" />
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${accent.band} ${accent.ink} border ${accent.ring}`}>
          {lot.vials.length} vial{lot.vials.length === 1 ? "" : "s"}
        </span>
        {!disabled && canRemove && (
          <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <div className="p-3 pl-5 space-y-3">
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
          {/* No "is this a blend?" toggle any more -- a blend is simply a
              product with more than one compound, so it's derived from the
              Compounds list rather than asserted separately. */}
          {lot.components.length > 1 && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground pb-2">
              Blend · {lot.components.length} compounds
            </span>
          )}
        </div>

        {/* The partner's original product string. Read-only reference: it's
            where the compounds and amounts below were read from, so it stays
            visible and verbatim for cross-checking, but it is never itself
            treated as a compound. */}
        {lot.partner_reported_name && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-600/90 dark:text-amber-400/90">
              As submitted by partner — reference only
            </div>
            <div className="text-xs font-mono mt-0.5 break-words">{lot.partner_reported_name}</div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Common / Marketing Name</Label>
            <Input
              className="h-8 mt-1" value={lot.display_name} disabled={disabled}
              placeholder={productName || "e.g. SUMMIT, KLOW — optional"}
              onChange={(e) => onChange({ display_name: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Optional. Left blank, this product is identified as{" "}
              <span className="font-mono">{lotDisplayName("", lot.components) || "—"}</span>
            </p>
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
        </div>

        {/* Compounds -- 1..N, no primary/secondary. Total label content is
            the sum of every amount here, so it's shown derived rather than
            typed (it used to take only the first compound's mass, which
            understated every blend). */}
        <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Compounds{lot.components.length > 1 ? ` (${lot.components.length})` : ""}
            </Label>
            <div className="flex items-center gap-3">
              <span className="text-xs">
                <span className="text-muted-foreground">Label content: </span>
                <span className="font-semibold">{totalMg != null ? `${totalMg} mg` : "—"}</span>
                {isLiquid && totalMg != null && <span className="text-muted-foreground"> / mL</span>}
              </span>
              {!disabled && (
                <Button type="button" size="sm" variant="outline"
                  onClick={() => onChange({ components: [...lot.components, emptyLineComponent()] })}>
                  <Plus className="size-3.5 mr-1" /> Add compound
                </Button>
              )}
            </div>
          </div>
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
              {!disabled && lot.components.length > 1 && (
                <Button type="button" size="icon" variant="ghost"
                  onClick={() => onChange({ components: lot.components.filter((_, i) => i !== idx) })}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Appearance -- entered once, applies to every vial below */}
        <div className="rounded-md border border-border bg-muted/40 p-2.5">
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

        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Notes for this lot</Label>
          <Textarea rows={2} className="mt-1" value={lot.notes} disabled={disabled}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>

        {/* Level 3 -- how many vials of each test, then the vials themselves.
            Inset and darker so the vials clearly sit INSIDE this lot. */}
        <div className={`rounded-md border-l-4 ${accent.ring} border-y border-r border-border bg-muted/60 p-2.5 space-y-2.5`}>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Test Vials <span className="normal-case tracking-normal">— belong to {lotId}</span>
          </Label>
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
                photos={photosByVial[idx] ?? []}
                onAddPhotos={(files) => onAddVialPhotos(idx, files)}
                onRemovePhoto={(fileIdx) => onRemoveVialPhoto(idx, fileIdx)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

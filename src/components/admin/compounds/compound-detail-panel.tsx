import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { type Compound } from "@/lib/compounds.functions";
import { BlendComponentsEditor } from "./blend-components-editor";

const CAL_KEYS = ["cal_l1_mg_per_ml", "cal_l2_mg_per_ml", "cal_l3_mg_per_ml", "cal_l4_mg_per_ml", "cal_l5_mg_per_ml", "cal_l6_mg_per_ml"] as const;

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

/**
 * Full per-compound configuration: acquisition method, processing method,
 * column temperature, injection volume, and default diluent live directly
 * on the compound — no method_groups indirection. Single compounds also
 * carry their own 6-point calibration; blends carry per-component targets
 * instead (see BlendComponentsEditor), since a blend has no single
 * meaningful target concentration.
 */
export function CompoundDetailPanel({
  compound, allCompounds, onPatch,
}: {
  compound: Compound;
  allCompounds: Compound[];
  onPatch: (patch: Partial<Compound>) => void;
}) {
  return (
    <div className="p-4 space-y-4 bg-muted/30 rounded-md border border-border">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Acquisition method</Label>
          <Input className="h-8 text-xs" defaultValue={compound.acquisition_method ?? ""} placeholder="e.g. GenAQ-Waters 8-2-26.amx"
            onBlur={(e) => onPatch({ acquisition_method: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Processing method</Label>
          <Input className="h-8 text-xs" defaultValue={compound.processing_method ?? ""} placeholder="e.g. CJC-1295 Std Cal.pmx"
            onBlur={(e) => onPatch({ processing_method: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Column temp (°C)</Label>
          <Input className="h-8 text-xs" type="number" step="0.1" defaultValue={compound.column_temperature_c ?? ""}
            onBlur={(e) => onPatch({ column_temperature_c: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Injection volume (µL)</Label>
          <Input className="h-8 text-xs" type="number" defaultValue={compound.injection_volume_ul ?? ""}
            onBlur={(e) => onPatch({ injection_volume_ul: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Wavelength (nm)</Label>
          <Input className="h-8 text-xs" type="number" step="1" defaultValue={compound.wavelength_nm ?? ""}
            onBlur={(e) => onPatch({ wavelength_nm: num(e.target.value) })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Default diluent</Label>
          <Input className="h-8 text-xs" defaultValue={compound.default_diluent_name ?? ""} placeholder="e.g. Mobile Phase A"
            onBlur={(e) => onPatch({ default_diluent_name: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CAS number</Label>
          <Input className="h-8 text-xs" defaultValue={compound.cas_number ?? ""} placeholder="Blank prints common name"
            onBlur={(e) => onPatch({ cas_number: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Molecular formula</Label>
          <Input className="h-8 text-xs" defaultValue={compound.molecular_formula ?? ""} placeholder="Blank prints common name"
            onBlur={(e) => onPatch({ molecular_formula: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default appearance</Label>
          <Input className="h-8 text-xs" defaultValue={compound.default_appearance ?? ""} placeholder="e.g. White cake"
            onBlur={(e) => onPatch({ default_appearance: e.target.value || null })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Aliases (market/shorthand names, comma-separated)</Label>
          <Input className="h-8 text-xs" defaultValue={(compound.aliases ?? []).join(", ")} placeholder="e.g. RETA, Reta"
            onBlur={(e) => {
              const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              onPatch({ aliases: list.length ? list : null });
            }} />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Switch checked={compound.is_blend} onCheckedChange={(v) => onPatch({ is_blend: v })} />
          <Label className="text-xs">Multi-compound blend</Label>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">SP-STD — Standard Prep modifications</Label>
          <Textarea className="text-xs min-h-16" defaultValue={compound.sp_std_notes ?? ""}
            placeholder="Anything that changes how this compound is prepped as a standard (e.g. reconstitution solvent, handling notes)…"
            onBlur={(e) => onPatch({ sp_std_notes: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">SP-SMP — Sample Prep modifications</Label>
          <Textarea className="text-xs min-h-16" defaultValue={compound.sp_smp_notes ?? ""}
            placeholder="Anything that changes how this compound is prepped as an unknown sample, if different from standard prep…"
            onBlur={(e) => onPatch({ sp_smp_notes: e.target.value || null })} />
        </div>
      </div>

      <Separator />

      {compound.is_blend ? (
        <BlendComponentsEditor blendId={compound.id} allCompounds={allCompounds} />
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-medium">Calibration levels (mg/mL)</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {CAL_KEYS.map((k, i) => (
              <div key={k} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">L{i + 1}</Label>
                <Input className="h-8 text-xs" type="number" step="0.05" defaultValue={compound[k] ?? ""}
                  onBlur={(e) => onPatch({ [k]: num(e.target.value) })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

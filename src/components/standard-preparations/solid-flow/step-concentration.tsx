import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Concentration, ConcUnit } from "./types";
import { EXP_PRESETS, type ExpirationCode } from "@/components/standard-preparations/prep-form-logic";

interface Props {
  value: Concentration;
  onChange: (c: Concentration) => void;
  calculatedMassMg: number | null;
  purityPercent: number | null;
}

const UNITS: ConcUnit[] = ["mg/mL", "mg/L", "µg/mL", "µg/L"];

export function StepConcentration({ value, onChange, calculatedMassMg, purityPercent }: Props) {
  function up<K extends keyof Concentration>(k: K, v: Concentration[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 3 — Concentration & Storage</h2>
        <p className="text-sm text-muted-foreground">
          Enter target concentration and final volume. Mass to weigh is computed from purity.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <Label className="text-xs">Standard name <span className="text-destructive">*</span></Label>
          <Input className="mt-1" value={value.standard_name} onChange={e => up("standard_name", e.target.value)} placeholder="e.g. Caffeine 1 mg/mL" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Final concentration <span className="text-destructive">*</span></Label>
            <Input type="number" step="any" className="mt-1" value={value.final_concentration} onChange={e => up("final_concentration", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Select value={value.final_concentration_unit} onValueChange={v => up("final_concentration_unit", v as ConcUnit)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Final volume (mL) <span className="text-destructive">*</span></Label>
            <Input type="number" step="any" className="mt-1" value={value.final_volume_ml} onChange={e => up("final_volume_ml", e.target.value)} />
          </div>
        </div>
        {calculatedMassMg != null && (
          <div className="text-sm rounded-md bg-muted/60 px-3 py-2">
            Mass to weigh: <span className="font-semibold">{calculatedMassMg.toFixed(3)} mg</span>
            {purityPercent != null && purityPercent < 100 && (
              <span className="text-xs text-muted-foreground ml-2">(purity-corrected @ {purityPercent}%)</span>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Storage & expiration</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Expiration period</Label>
            <Select value={value.expiration_period_code} onValueChange={v => {
              const code = v as ExpirationCode;
              const days = code === "custom" ? value.expiration_period_days : String(EXP_PRESETS[code].days);
              onChange({ ...value, expiration_period_code: code as Concentration["expiration_period_code"], expiration_period_days: days });
            }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EXP_PRESETS).map(([k, p]) => (
                  <SelectItem key={k} value={k}>{p.label}</SelectItem>
                ))}
                <SelectItem value="custom">Custom (days)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {value.expiration_period_code === "custom" && (
            <div>
              <Label className="text-xs">Custom days</Label>
              <Input type="number" step="1" className="mt-1" value={value.expiration_period_days} onChange={e => up("expiration_period_days", e.target.value)} />
            </div>
          )}
          <div>
            <Label className="text-xs">Storage condition</Label>
            <Input className="mt-1" value={value.storage_condition} onChange={e => up("storage_condition", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Storage location</Label>
            <Input className="mt-1" value={value.storage_location} onChange={e => up("storage_location", e.target.value)} placeholder="e.g. Fridge A, shelf 2" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea className="mt-1" rows={2} value={value.notes} onChange={e => up("notes", e.target.value)} />
        </div>
      </Card>
    </div>
  );
}

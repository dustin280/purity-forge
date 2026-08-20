import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { DilutionResult } from "@/lib/sample-prep/dilution";
import { EXP_PRESETS, type ExpirationCode } from "@/components/standard-preparations/prep-form-logic";
import type { WorkingConcentration, ConcUnit } from "./types";

interface Props {
  value: WorkingConcentration;
  onChange: (c: WorkingConcentration) => void;
  dilutionResult: DilutionResult | null;
}

const UNITS: ConcUnit[] = ["mg/mL", "mg/L", "µg/mL", "µg/L"];

export function StepConcentration({ value, onChange, dilutionResult }: Props) {
  function up<K extends keyof WorkingConcentration>(k: K, v: WorkingConcentration[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 3 — Concentration & Storage</h2>
        <p className="text-sm text-muted-foreground">
          Enter the target concentration and final volume — the dilution from the primary is computed below.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <Label className="text-xs">Standard name <span className="text-destructive">*</span></Label>
          <Input className="mt-1" value={value.standard_name} onChange={e => up("standard_name", e.target.value)} placeholder="e.g. Caffeine working std 0.01 mg/mL" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Target concentration <span className="text-destructive">*</span></Label>
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

        {dilutionResult?.error && (
          <p className="text-sm text-destructive">{dilutionResult.error}</p>
        )}

        {dilutionResult && !dilutionResult.error && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Badge variant={dilutionResult.serial ? "default" : "secondary"}>
                {dilutionResult.serial ? `Serial dilution · ${dilutionResult.steps.length} steps` : "Single step"}
              </Badge>
              <Badge variant="outline">Dilution factor {dilutionResult.dilutionFactor.toFixed(1)}×</Badge>
            </div>
            {dilutionResult.warnings.length > 0 && (
              <ul className="text-xs text-amber-600 list-disc pl-5 space-y-0.5">
                {dilutionResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-1 pr-2 w-10">#</th>
                    <th className="py-1 pr-2">From</th>
                    <th className="py-1 pr-2">Aliquot</th>
                    <th className="py-1 pr-2">Diluent</th>
                    <th className="py-1 pr-2">Final volume</th>
                    <th className="py-1 pr-2">Resulting concentration</th>
                  </tr>
                </thead>
                <tbody>
                  {dilutionResult.steps.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2 font-mono text-xs">{i + 1}</td>
                      <td className="py-1 pr-2">{s.fromLabel}</td>
                      <td className="py-1 pr-2 font-mono">{s.aliquotDisplay}</td>
                      <td className="py-1 pr-2 font-mono">{s.diluentDisplay}</td>
                      <td className="py-1 pr-2 font-mono">{s.finalVolDisplay}</td>
                      <td className="py-1 pr-2 font-mono">{s.resultConcDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              onChange({ ...value, expiration_period_code: code as WorkingConcentration["expiration_period_code"], expiration_period_days: days });
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

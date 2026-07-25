import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, X } from "lucide-react";
import {
  computeDilution,
  MASS_UNITS,
  VOL_UNITS,
  type MassUnit,
  type VolUnit,
  type DilutionResult,
} from "@/lib/sample-prep/dilution";

const MIN_PIPETTE_UL = 10;

export interface DilutionSnapshot {
  title: string;
  stock: { conc: string; massUnit: MassUnit; volUnit: VolUnit; availableVol: string; availableVolUnit: VolUnit };
  target: { conc: string; massUnit: MassUnit; volUnit: VolUnit; finalVol: string; finalVolUnit: VolUnit };
  diluent: string;
  result: DilutionResult | null;
}

interface Props {
  title?: string;
  onTitleChange?: (t: string) => void;
  onRemove?: () => void;
  onSnapshot?: (s: DilutionSnapshot) => void;
}

export function DilutionCalculator({ title, onTitleChange, onRemove, onSnapshot }: Props = {}) {
  // Stock
  const [c1, setC1] = useState("10");
  const [c1Mass, setC1Mass] = useState<MassUnit>("mg");
  const [c1Vol, setC1Vol] = useState<VolUnit>("mL");
  const [v1, setV1] = useState("1");
  const [v1Unit, setV1Unit] = useState<VolUnit>("mL");

  // Target
  const [c2, setC2] = useState("0.01");
  const [c2Mass, setC2Mass] = useState<MassUnit>("mg");
  const [c2Vol, setC2Vol] = useState<VolUnit>("mL");
  const [v2, setV2] = useState("1");
  const [v2Unit, setV2Unit] = useState<VolUnit>("mL");

  const [diluent, setDiluent] = useState("Diluent");

  const result = useMemo(() => {
    const c1n = Number(c1), v1n = Number(v1), c2n = Number(c2), v2n = Number(v2);
    if (![c1n, v1n, c2n, v2n].every(n => Number.isFinite(n) && n > 0)) return null;
    return computeDilution({
      stock: { conc: c1n, massUnit: c1Mass, volUnit: c1Vol, availableVol: v1n, availableVolUnit: v1Unit },
      target: { conc: c2n, massUnit: c2Mass, volUnit: c2Vol, finalVol: v2n, finalVolUnit: v2Unit },
      diluentName: diluent || "Diluent",
      minPipetteUl: MIN_PIPETTE_UL,
    });
  }, [c1, c1Mass, c1Vol, v1, v1Unit, c2, c2Mass, c2Vol, v2, v2Unit, diluent]);

  useEffect(() => {
    onSnapshot?.({
      title: title ?? "",
      stock: { conc: c1, massUnit: c1Mass, volUnit: c1Vol, availableVol: v1, availableVolUnit: v1Unit },
      target: { conc: c2, massUnit: c2Mass, volUnit: c2Vol, finalVol: v2, finalVolUnit: v2Unit },
      diluent,
      result,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c1, c1Mass, c1Vol, v1, v1Unit, c2, c2Mass, c2Vol, v2, v2Unit, diluent, result, title]);

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.procedure).then(
      () => toast.success("Copied procedure"),
      () => toast.error("Copy failed"),
    );
  }

  return (
    <div className="space-y-4 prep-card">
      <Card className="p-5 space-y-4 print:break-inside-avoid">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {onTitleChange ? (
            <Input
              value={title ?? ""}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Prep name (e.g. Sample A working std)"
              className="max-w-sm font-semibold"
            />
          ) : (
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dilution Calculator</h2>
          )}
          {onRemove && (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove} className="print:hidden">
              <X className="size-4 mr-1" /> Remove
            </Button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider">Stock sample</div>
            <div className="space-y-1">
              <Label>Concentration</Label>
              <div className="flex gap-1">
                <Input type="number" step="any" min={0} value={c1} onChange={e => setC1(e.target.value)} className="flex-1" />
                <UnitSelect value={c1Mass} onChange={setC1Mass} units={MASS_UNITS} width="w-[72px]" />
                <span className="self-center text-sm text-muted-foreground">/</span>
                <UnitSelect value={c1Vol} onChange={setC1Vol} units={VOL_UNITS} width="w-[72px]" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Available volume</Label>
              <div className="flex gap-1">
                <Input type="number" step="any" min={0} value={v1} onChange={e => setV1(e.target.value)} className="flex-1" />
                <UnitSelect value={v1Unit} onChange={setV1Unit} units={VOL_UNITS} width="w-[72px]" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider">Desired sample</div>
            <div className="space-y-1">
              <Label>Concentration</Label>
              <div className="flex gap-1">
                <Input type="number" step="any" min={0} value={c2} onChange={e => setC2(e.target.value)} className="flex-1" />
                <UnitSelect value={c2Mass} onChange={setC2Mass} units={MASS_UNITS} width="w-[72px]" />
                <span className="self-center text-sm text-muted-foreground">/</span>
                <UnitSelect value={c2Vol} onChange={setC2Vol} units={VOL_UNITS} width="w-[72px]" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Final volume</Label>
              <div className="flex gap-1">
                <Input type="number" step="any" min={0} value={v2} onChange={e => setV2(e.target.value)} className="flex-1" />
                <UnitSelect value={v2Unit} onChange={setV2Unit} units={VOL_UNITS} width="w-[72px]" />
              </div>
            </div>
          </section>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <Label>Diluent</Label>
            <Input value={diluent} onChange={e => setDiluent(e.target.value)} placeholder="e.g. Water, MeOH, mobile phase" />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3 print:break-inside-avoid">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preparation</h2>
          {result && (
            <div className="flex items-center gap-2">
              <Badge variant={result.serial ? "default" : "secondary"}>
                {result.serial ? `Serial dilution · ${result.steps.length} steps` : "Single step"}
              </Badge>
              <Badge variant="outline">Dilution factor {formatNum(result.dilutionFactor)}×</Badge>
              <Button type="button" size="sm" variant="ghost" onClick={copy}><Copy className="size-4 mr-1" /> Copy</Button>
            </div>
          )}
        </div>

        {!result && (
          <p className="text-sm text-muted-foreground">Enter positive numbers for concentrations and volumes.</p>
        )}

        {result?.error && (
          <p className="text-sm text-destructive">{result.error}</p>
        )}

        {result && !result.error && (
          <>
            {result.warnings.length > 0 && (
              <ul className="text-xs text-amber-600 list-disc pl-5 space-y-0.5">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
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
                  {result.steps.map((s, i) => (
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

            <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-3 border font-mono leading-relaxed">
{result.procedure}
            </pre>
          </>
        )}
      </Card>
    </div>
  );
}

function UnitSelect<T extends string>({ value, onChange, units, width }: { value: T; onChange: (v: T) => void; units: readonly T[]; width: string }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as T)}>
      <SelectTrigger className={`${width} shrink-0`}><SelectValue /></SelectTrigger>
      <SelectContent>
        {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return Number(n.toPrecision(3)).toString();
}
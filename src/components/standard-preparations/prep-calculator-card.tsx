import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy, ExternalLink, AlertTriangle, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Field } from "./prep-form-field";
import type { ExpirationCode, RefForm } from "./prep-form-logic";
import { CONC_UNITS, type ConcUnit } from "./target-units";
import type { UsePrepFormReturn } from "./use-prep-form";

export function PrepCalculatorCard({ f, batchMode, docNumberPreview }: { f: UsePrepFormReturn; batchMode: boolean; docNumberPreview?: string }) {
  const {
    v, up, markOverridden, computedExpiration, shelfLifeWarning, calcRows,
    addTargetRows, updateTarget, removeTarget, pasteTargets, calcOpen, setCalcOpen,
    procedureText, summaryText, copy,
  } = f;
  const isLiquid = v.ref_form === "liquid";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reference Material & Calculator</h2>
        {v.material_receipt_id && (
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={`/material-receipts/${v.material_receipt_id}`} target="_blank" rel="noopener">
              <ExternalLink className="size-4 mr-1" /> View Linked Receipt
            </a>
          </Button>
        )}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Reference form">
          <Select value={v.ref_form} onValueChange={val => markOverridden("ref_form", val as RefForm)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid (weigh by mass)</SelectItem>
              <SelectItem value="liquid">Liquid (pipette from stock)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Reference material name">
          <div className="flex gap-1 items-start">
            <Input value={v.ref_material_name} onChange={e => markOverridden("ref_material_name", e.target.value)} maxLength={255} />
            {v.material_overridden && <Badge variant="outline" className="mt-2 text-[10px]">Overridden</Badge>}
          </div>
        </Field>
        <Field label="Lot #">
          <Input value={v.ref_lot} onChange={e => markOverridden("ref_lot", e.target.value)} maxLength={255} />
        </Field>
        <Field label="Receipt date">
          <Input type="date" value={v.ref_receipt_date} onChange={e => markOverridden("ref_receipt_date", e.target.value)} />
        </Field>
        {isLiquid ? (
          <Field label="Stock concentration (mg/mL)">
            <Input type="number" step="any" value={v.ref_concentration_mg_per_ml} onChange={e => markOverridden("ref_concentration_mg_per_ml", e.target.value)} />
          </Field>
        ) : (
          <Field label="Purity (%)">
            <Input type="number" step="any" value={v.ref_purity_percent} onChange={e => markOverridden("ref_purity_percent", e.target.value)} />
          </Field>
        )}
        <Field label="Molecular weight (g/mol)">
          <Input type="number" step="any" value={v.ref_molecular_weight} onChange={e => markOverridden("ref_molecular_weight", e.target.value)} />
        </Field>
        <Field label="Shelf life (months)">
          <Input type="number" step={1} value={v.ref_shelf_life_months} onChange={e => markOverridden("ref_shelf_life_months", e.target.value)} />
        </Field>
      </div>

      <div className="grid md:grid-cols-3 gap-4 pt-2 border-t">
        <Field label="Expiration period">
          <Select value={v.expiration_period_code} onValueChange={val => up("expiration_period_code", val as ExpirationCode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1w">1 week</SelectItem>
              <SelectItem value="2w">2 weeks</SelectItem>
              <SelectItem value="4w">4 weeks</SelectItem>
              <SelectItem value="3m">3 months</SelectItem>
              <SelectItem value="6m">6 months</SelectItem>
              <SelectItem value="custom">Custom days</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {v.expiration_period_code === "custom" && (
          <Field label="Custom days">
            <Input type="number" min={1} step={1} value={v.expiration_period_days} onChange={e => up("expiration_period_days", e.target.value)} />
          </Field>
        )}
        <Field label="Calculated expiration date">
          <Input type="date" value={computedExpiration} readOnly className="bg-muted/30" />
        </Field>
      </div>
      {shelfLifeWarning && (
        <div className="flex gap-2 items-start text-xs rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <span>{shelfLifeWarning}</span>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 pt-2 border-t">
        <Field label="Initial solvent">
          <Input value={v.initial_solvent} onChange={e => up("initial_solvent", e.target.value)} placeholder="e.g. DMSO" maxLength={500} />
        </Field>
        <Field label="Final diluent">
          <Input value={v.final_diluent} onChange={e => up("final_diluent", e.target.value)} maxLength={500} />
        </Field>
        <Field label="Modifier %">
          <Input type="number" step="any" value={v.modifier_percent} onChange={e => up("modifier_percent", e.target.value)} placeholder="e.g. 0.1" />
        </Field>
      </div>

      <div className="pt-2 border-t">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desired Standards ({v.targets.length})</h3>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => addTargetRows(1)}><Plus className="size-4 mr-1" /> Add row</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addTargetRows(10)}>+10</Button>
            <Button type="button" size="sm" variant="ghost" onClick={async () => { try { const t = await navigator.clipboard.readText(); pasteTargets(t); } catch { toast.error("Clipboard unavailable"); } }}>Paste</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-1 pr-2 w-8">#</th>
                {batchMode && <th className="py-1 pr-2 w-40">SYN ID (preview)</th>}
                <th className="py-1 pr-2 min-w-[160px]">Name</th>
                <th className="py-1 pr-2 w-44">Concentration</th>
                <th className="py-1 pr-2 w-28">Vol (mL)</th>
                <th className="py-1 pr-2 w-32">{isLiquid ? "Stock vol (mL)" : "Mass (mg)"}</th>
                <th className="py-1 pr-2">Notes</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {v.targets.map((t, idx) => {
                const row = calcRows[idx];
                return (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-1 pr-2 text-xs font-mono text-muted-foreground">{idx + 1}</td>
                    {batchMode && (
                      <td className="py-1 pr-2 text-xs font-mono text-muted-foreground">
                        {docNumberPreview ?? "—"}
                      </td>
                    )}
                    <td className="py-1 pr-2"><Input value={t.name} onChange={e => updateTarget(idx, { name: e.target.value })} maxLength={255} /></td>
                    <td className="py-1 pr-2">
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="any"
                          value={t.target_concentration_mg_per_ml}
                          onChange={e => updateTarget(idx, { target_concentration_mg_per_ml: e.target.value })}
                          className="flex-1 min-w-0"
                        />
                        <Select
                          value={t.target_concentration_unit}
                          onValueChange={val => updateTarget(idx, { target_concentration_unit: val as ConcUnit })}
                        >
                          <SelectTrigger className="w-[88px] shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONC_UNITS.map(u => (
                              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="py-1 pr-2"><Input type="number" step="any" value={t.target_volume_ml} onChange={e => updateTarget(idx, { target_volume_ml: e.target.value })} /></td>
                    <td className="py-1 pr-2 text-xs font-mono">
                      {isLiquid
                        ? (row?.stockVolMl != null ? row.stockVolMl.toFixed(4) : "—")
                        : (row?.mass != null ? row.mass.toFixed(4) : "—")}
                    </td>
                    <td className="py-1 pr-2"><Input value={t.notes} onChange={e => updateTarget(idx, { notes: e.target.value })} maxLength={2000} /></td>
                    <td className="py-1"><Button type="button" size="icon" variant="ghost" onClick={() => removeTarget(idx)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pt-3 flex justify-end">
          <Button type="button" onClick={() => setCalcOpen(true)} variant="default">
            <Calculator className="size-4 mr-1" /> Calculate Preparation
          </Button>
        </div>
      </div>

      {calcOpen && (
        <div className="space-y-3 pt-3 border-t">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Procedure</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => copy(procedureText, "Procedure")}><Copy className="size-3 mr-1" /> Copy</Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-3 border">{procedureText}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Traceability Summary</h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => copy(summaryText, "Summary")}><Copy className="size-3 mr-1" /> Copy</Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-3 border">{summaryText}</pre>
          </div>
        </div>
      )}
    </Card>
  );
}
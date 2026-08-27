import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPrepSettings } from "@/lib/sample-prep/master-data.functions";

export type EndotoxinData = {
  verdict: "pass" | "fail";
  method: "gel_clot" | "kinetic_turbidimetric" | "kinetic_chromogenic";
  /** Optional supporting reading -- the recorded outcome is the verdict, not a limit comparison. */
  result_value: number | null;
  unit: "EU/mL" | "EU/device" | null;
};

const METHOD_LABEL: Record<EndotoxinData["method"], string> = {
  gel_clot: "Gel Clot",
  kinetic_turbidimetric: "Kinetic Turbidimetric",
  kinetic_chromogenic: "Kinetic Chromogenic",
};

export function EndotoxinFields({ onSave, busy }: { onSave: (data: EndotoxinData) => void; busy: boolean }) {
  const getSettingsFn = useServerFn(getPrepSettings);
  const { data: settings } = useQuery({ queryKey: ["sp-settings"], queryFn: () => getSettingsFn() });

  const [verdict, setVerdict] = useState<EndotoxinData["verdict"] | null>(null);
  const [method, setMethod] = useState<EndotoxinData["method"]>("kinetic_turbidimetric");
  const [resultValue, setResultValue] = useState("");
  const [unit, setUnit] = useState<NonNullable<EndotoxinData["unit"]>>("EU/mL");

  const rv = resultValue.trim() === "" ? null : Number(resultValue);
  const rvValid = rv === null || (!isNaN(rv) && rv >= 0);
  const valid = verdict !== null && rvValid;

  return (
    <div className="space-y-3">
      <div className="text-xs rounded border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
        Assay Sensitivity: <span className="font-mono text-foreground">
          {settings?.endotoxin_assay_sensitivity_eu_per_ml != null ? `<${settings.endotoxin_assay_sensitivity_eu_per_ml} EU/mL` : "—"}
        </span>
        <span className="block mt-0.5">Fixed lab setting — not entered per result. Change it in Sample Prep Settings.</span>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Verdict</label>
        <div className="flex gap-2 mt-1">
          <Button
            type="button"
            size="sm"
            variant={verdict === "pass" ? "default" : "outline"}
            className={verdict === "pass" ? "" : ""}
            style={verdict === "pass" ? { background: "var(--status-success)", borderColor: "var(--status-success)" } : undefined}
            onClick={() => setVerdict("pass")}
          >
            Pass
          </Button>
          <Button
            type="button"
            size="sm"
            variant={verdict === "fail" ? "default" : "outline"}
            style={verdict === "fail" ? { background: "var(--destructive)", borderColor: "var(--destructive)" } : undefined}
            onClick={() => setVerdict("fail")}
          >
            Fail
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Method</label>
        <Select value={method} onValueChange={v => setMethod(v as EndotoxinData["method"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(METHOD_LABEL) as EndotoxinData["method"][]).map(m => (
              <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Reading (optional)</label>
          <Input type="number" step="any" value={resultValue} onChange={e => setResultValue(e.target.value)} placeholder="Not recorded" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Unit</label>
          <Select value={unit} onValueChange={v => setUnit(v as NonNullable<EndotoxinData["unit"]>)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EU/mL">EU/mL</SelectItem>
              <SelectItem value="EU/device">EU/device</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        size="sm"
        disabled={busy || !valid}
        onClick={() => verdict && onSave({ verdict, method, result_value: rv, unit: rv !== null ? unit : null })}
      >
        {busy ? "Saving…" : "Save Endotoxin Result"}
      </Button>
    </div>
  );
}

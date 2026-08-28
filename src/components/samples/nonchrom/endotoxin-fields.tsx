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
  /** Set when the reading is below/above the assay's range rather than an exact value (e.g. "<0.05"). */
  result_comparator: "<" | ">" | null;
  unit: "EU/mL" | "EU/device" | null;
};

const METHOD_LABEL: Record<EndotoxinData["method"], string> = {
  gel_clot: "Gel Clot",
  kinetic_turbidimetric: "Kinetic Turbidimetric",
  kinetic_chromogenic: "Kinetic Chromogenic",
};

/** Parses a typed reading like "<0.05", ">5", or "1.2" into a value + optional comparator. */
function parseReading(raw: string): { value: number; comparator: "<" | ">" | null } | null {
  const m = raw.trim().match(/^([<>])?\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const value = Number(m[2]);
  if (isNaN(value) || value < 0) return null;
  return { value, comparator: (m[1] as "<" | ">" | undefined) ?? null };
}

export function EndotoxinFields({ onSave, busy }: { onSave: (data: EndotoxinData) => void; busy: boolean }) {
  const getSettingsFn = useServerFn(getPrepSettings);
  const { data: settings } = useQuery({ queryKey: ["sp-settings"], queryFn: () => getSettingsFn() });

  const [verdict, setVerdict] = useState<EndotoxinData["verdict"] | null>(null);
  const [method, setMethod] = useState<EndotoxinData["method"]>("kinetic_turbidimetric");
  const [resultValue, setResultValue] = useState("");
  const [unit, setUnit] = useState<NonNullable<EndotoxinData["unit"]>>("EU/mL");

  const parsedReading = resultValue.trim() === "" ? null : parseReading(resultValue);
  const rvValid = resultValue.trim() === "" || parsedReading !== null;
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
          <Input
            type="text"
            inputMode="decimal"
            className="mt-1"
            value={resultValue}
            onChange={e => setResultValue(e.target.value)}
            placeholder="Not recorded — e.g. <0.05"
          />
          {resultValue.trim() !== "" && !parsedReading && (
            <p className="mt-1 text-[11px] text-destructive">
              Enter a number, optionally starting with &lt; or &gt; (e.g. &lt;0.05)
            </p>
          )}
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
        onClick={() => verdict && onSave({
          verdict, method,
          result_value: parsedReading?.value ?? null,
          result_comparator: parsedReading?.comparator ?? null,
          unit: parsedReading ? unit : null,
        })}
      >
        {busy ? "Saving…" : "Save Endotoxin Result"}
      </Button>
    </div>
  );
}

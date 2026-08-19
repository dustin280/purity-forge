import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type EndotoxinData = {
  result_value: number;
  unit: "EU/mL" | "EU/device";
  limit: number;
  method: "gel_clot" | "kinetic_turbidimetric" | "kinetic_chromogenic";
};

const METHOD_LABEL: Record<EndotoxinData["method"], string> = {
  gel_clot: "Gel Clot",
  kinetic_turbidimetric: "Kinetic Turbidimetric",
  kinetic_chromogenic: "Kinetic Chromogenic",
};

export function EndotoxinFields({ onSave, busy }: { onSave: (data: EndotoxinData) => void; busy: boolean }) {
  const [resultValue, setResultValue] = useState("");
  const [unit, setUnit] = useState<EndotoxinData["unit"]>("EU/mL");
  const [limit, setLimit] = useState("");
  const [method, setMethod] = useState<EndotoxinData["method"]>("kinetic_turbidimetric");

  const rv = Number(resultValue);
  const lim = Number(limit);
  const valid = resultValue.trim() !== "" && !isNaN(rv) && rv >= 0 && limit.trim() !== "" && !isNaN(lim) && lim > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Result</label>
          <Input type="number" step="any" value={resultValue} onChange={e => setResultValue(e.target.value)} placeholder="0.05" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Unit</label>
          <Select value={unit} onValueChange={v => setUnit(v as EndotoxinData["unit"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EU/mL">EU/mL</SelectItem>
              <SelectItem value="EU/device">EU/device</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Limit</label>
          <Input type="number" step="any" value={limit} onChange={e => setLimit(e.target.value)} placeholder="0.5" />
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
      {valid && (
        <p className="text-xs" style={{ color: rv <= lim ? "var(--status-success)" : "var(--destructive)" }}>
          {rv <= lim ? "Within limit — will save as PASS" : "Exceeds limit — will save as FAIL"}
        </p>
      )}
      <Button
        size="sm"
        disabled={busy || !valid}
        onClick={() => onSave({ result_value: rv, unit, limit: lim, method })}
      >
        {busy ? "Saving…" : "Save Endotoxin Result"}
      </Button>
    </div>
  );
}

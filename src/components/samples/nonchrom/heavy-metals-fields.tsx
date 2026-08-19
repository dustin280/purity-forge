import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type HeavyMetalsData = {
  elements: { mercury: number | null; lead: number | null; arsenic: number | null; cadmium: number | null };
  unit: string;
  lab_name: string | null;
  report_reference: string | null;
};

const ELEMENT_LABEL = { mercury: "Mercury (Hg)", lead: "Lead (Pb)", arsenic: "Arsenic (As)", cadmium: "Cadmium (Cd)" } as const;

export function HeavyMetalsFields({ onSave, busy }: { onSave: (data: HeavyMetalsData) => void; busy: boolean }) {
  const [values, setValues] = useState<Record<keyof typeof ELEMENT_LABEL, string>>({
    mercury: "", lead: "", arsenic: "", cadmium: "",
  });
  const [unit, setUnit] = useState("ppm");
  const [labName, setLabName] = useState("");
  const [reportRef, setReportRef] = useState("");

  const parsed = Object.fromEntries(
    (Object.keys(values) as (keyof typeof ELEMENT_LABEL)[]).map(k => [k, values[k].trim() === "" ? null : Number(values[k])]),
  ) as HeavyMetalsData["elements"];
  const anyEntered = Object.values(parsed).some(v => v != null);
  const anyInvalid = (Object.keys(values) as (keyof typeof ELEMENT_LABEL)[]).some(k => values[k].trim() !== "" && isNaN(Number(values[k])));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(ELEMENT_LABEL) as (keyof typeof ELEMENT_LABEL)[]).map(k => (
          <div key={k}>
            <label className="text-xs text-muted-foreground">{ELEMENT_LABEL[k]}</label>
            <Input type="number" step="any" value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} placeholder="0.00" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Unit</label>
          <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="ppm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Lab name</label>
          <Input value={labName} onChange={e => setLabName(e.target.value)} placeholder="Outsourced lab" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Report reference</label>
          <Input value={reportRef} onChange={e => setReportRef(e.target.value)} placeholder="COA #" />
        </div>
      </div>
      <Button
        size="sm"
        disabled={busy || !anyEntered || anyInvalid || !unit.trim()}
        onClick={() => onSave({ elements: parsed, unit: unit.trim(), lab_name: labName.trim() || null, report_reference: reportRef.trim() || null })}
      >
        {busy ? "Saving…" : "Save Heavy Metals Result"}
      </Button>
    </div>
  );
}

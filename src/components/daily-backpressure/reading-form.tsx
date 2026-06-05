import { useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listHplcColumns } from "@/lib/hplc-columns.functions";
import { qk } from "@/lib/query-keys";

const DEFAULT_INSTRUMENT = "Infinity III HPLC-DAD";

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

interface ReadingFormProps {
  defaultUserName: string;
  defaultInstrument?: string;
  loading: boolean;
  onSubmit: (data: {
    reading_at: string;
    user_name: string;
    instrument: string;
    backpressure: number;
    backpressure_unit: string;
    notes: string | null;
    injections_count: number | null;
    mobile_phase: string | null;
    flow_rate: number | null;
    flow_rate_unit: string | null;
    column_temp: number | null;
    column_temp_unit: string | null;
    column_name: string | null;
  }) => void;
}

export function ReadingForm({
  defaultUserName,
  defaultInstrument = DEFAULT_INSTRUMENT,
  loading,
  onSubmit,
}: ReadingFormProps) {
  const [readingAt, setReadingAt] = useState(nowLocal());
  const [userName, setUserName] = useState(defaultUserName);
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [backpressure, setBackpressure] = useState("");
  const [unit, setUnit] = useState("bar");
  const [notes, setNotes] = useState("");
  const [injections, setInjections] = useState("");
  const [mobilePhase, setMobilePhase] = useState("");
  const [flowRate, setFlowRate] = useState("");
  const [flowRateUnit, setFlowRateUnit] = useState("mL/min");
  const [columnTemp, setColumnTemp] = useState("");
  const [columnTempUnit, setColumnTempUnit] = useState("C");
  const [columnName, setColumnName] = useState("");
  const listCols = useServerFn(listHplcColumns);
  const { data: columns = [] } = useQuery({
    queryKey: qk.hplcColumns.list(),
    queryFn: () => listCols(),
  });
  const activeColumns = columns.filter((c) => c.is_active);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !userName.trim() ||
      !instrument.trim() ||
      backpressure === "" ||
      Number.isNaN(Number(backpressure))
    ) {
      toast.error("Fill in all required fields.");
      return;
    }
    onSubmit({
      reading_at: new Date(readingAt).toISOString(),
      user_name: userName.trim(),
      instrument: instrument.trim(),
      backpressure: Number(backpressure),
      backpressure_unit: unit,
      notes: notes.trim() || null,
      injections_count: injections === "" ? null : Number(injections),
      mobile_phase: mobilePhase.trim() || null,
      flow_rate: flowRate === "" ? null : Number(flowRate),
      flow_rate_unit: flowRate === "" ? null : flowRateUnit,
      column_temp: columnTemp === "" ? null : Number(columnTemp),
      column_temp_unit: columnTemp === "" ? null : columnTempUnit,
      column_name: columnName.trim() || null,
    });
    // reset
    setReadingAt(nowLocal());
    setBackpressure("");
    setNotes("");
    setInjections("");
    setMobilePhase("");
    setFlowRate("");
    setColumnTemp("");
    setColumnName("");
  }

  return (
    <Card className="p-5 mb-6">
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>
          <strong className="text-foreground">Note:</strong> Record the backpressure at the
          <em> initiation of a run</em>, along with the starting conditions below.
        </span>
      </div>
      <form onSubmit={handleSubmit} className="grid md:grid-cols-6 gap-3 items-end">
        <Field className="md:col-span-2" label="Date & time" required>
          <Input
            type="datetime-local"
            value={readingAt}
            onChange={(e) => setReadingAt(e.target.value)}
            required
          />
        </Field>
        <Field className="md:col-span-2" label="User" required>
          <Input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="First Last"
            required
            maxLength={255}
          />
        </Field>
        <Field className="md:col-span-2" label="Instrument" required>
          <Input
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            required
            maxLength={255}
          />
        </Field>
        <Field className="md:col-span-2" label="Backpressure" required>
          <Input
            type="number"
            step="0.1"
            value={backpressure}
            onChange={(e) => setBackpressure(e.target.value)}
            placeholder="e.g. 320"
            required
          />
        </Field>
        <Field className="md:col-span-1" label="Unit">
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">bar</SelectItem>
              <SelectItem value="psi">psi</SelectItem>
              <SelectItem value="MPa">MPa</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2" label="# of Injections">
          <Input
            type="number"
            min="0"
            step="1"
            value={injections}
            onChange={(e) => setInjections(e.target.value)}
            placeholder="e.g. 42"
          />
        </Field>

        <div className="md:col-span-6 mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Starting Conditions
        </div>
        <Field className="md:col-span-3" label="Mobile phase">
          <Input
            value={mobilePhase}
            onChange={(e) => setMobilePhase(e.target.value)}
            placeholder="e.g. 0.1% TFA in H2O / ACN"
            maxLength={500}
          />
        </Field>
        <Field className="md:col-span-3" label="Column">
          <Select
            value={columnName || "__none__"}
            onValueChange={(val) => setColumnName(val === "__none__" ? "" : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a column…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {activeColumns.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                  {c.part_number ? ` — P/N ${c.part_number}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2" label="Flow rate">
          <Input
            type="number"
            step="0.01"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="e.g. 1.0"
          />
        </Field>
        <Field className="md:col-span-1" label="Unit">
          <Select value={flowRateUnit} onValueChange={setFlowRateUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mL/min">mL/min</SelectItem>
              <SelectItem value="µL/min">µL/min</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2" label="Column temperature">
          <Input
            type="number"
            step="0.1"
            value={columnTemp}
            onChange={(e) => setColumnTemp(e.target.value)}
            placeholder="e.g. 30"
          />
        </Field>
        <Field className="md:col-span-1" label="Unit">
          <Select value={columnTempUnit} onValueChange={setColumnTempUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="C">°C</SelectItem>
              <SelectItem value="F">°F</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field className="md:col-span-3" label="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={1}
            maxLength={2000}
            placeholder="Anything noteworthy…"
          />
        </Field>
        <div className="md:col-span-6 flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Add Reading"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

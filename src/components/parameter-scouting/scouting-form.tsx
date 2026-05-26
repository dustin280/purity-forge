import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GradientEditor } from "./gradient-editor";
import { RunListEditor } from "./run-list-editor";
import type { CompoundOption } from "./compound-picker";
import type {
  GradientStep,
  ParameterScoutingRow,
  RunListItem,
} from "@/lib/parameter-scouting.functions";
import type { ScoutingPayload } from "./use-parameter-scouting";

const DEFAULT_MP_A = "H2O + 0.1% TFA";
const DEFAULT_MP_B = "ACN + 0.1% TFA";

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
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

interface ScoutingFormProps {
  defaultUserName: string;
  compoundOptions: CompoundOption[];
  onCreateCompound?: (name: string) => Promise<CompoundOption>;
  editing: ParameterScoutingRow | null;
  loading: boolean;
  onSubmit: (payload: ScoutingPayload) => void;
  onCancelEdit: () => void;
}

export function ScoutingForm({
  defaultUserName,
  compoundOptions,
  onCreateCompound,
  editing,
  loading,
  onSubmit,
  onCancelEdit,
}: ScoutingFormProps) {
  const [runAt, setRunAt] = useState(nowLocal());
  const [userName, setUserName] = useState(defaultUserName);
  const [flowRate, setFlowRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [mpA, setMpA] = useState(DEFAULT_MP_A);
  const [mpB, setMpB] = useState(DEFAULT_MP_B);
  const [diluent, setDiluent] = useState("");
  const [comments, setComments] = useState("");
  const [gradient, setGradient] = useState<GradientStep[]>([]);
  const [runList, setRunList] = useState<RunListItem[]>([]);

  const reset = () => {
    setRunAt(nowLocal());
    setUserName(defaultUserName);
    setFlowRate("");
    setTemperature("");
    setMpA(DEFAULT_MP_A);
    setMpB(DEFAULT_MP_B);
    setDiluent("");
    setComments("");
    setGradient([]);
    setRunList([]);
  };

  useEffect(() => {
    if (editing) {
      setRunAt(toLocalInput(editing.run_at));
      setUserName(editing.user_name);
      setFlowRate(
        editing.flow_rate_ml_per_min === null
          ? ""
          : String(editing.flow_rate_ml_per_min),
      );
      setTemperature(
        editing.temperature_c === null ? "" : String(editing.temperature_c),
      );
      setMpA(editing.mobile_phase_a);
      setMpB(editing.mobile_phase_b);
      setDiluent(editing.sample_diluent ?? "");
      setComments(editing.comments ?? "");
      setGradient(editing.gradient ?? []);
      setRunList(editing.run_list ?? []);
    }
  }, [editing]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userName.trim()) {
      toast.error("User is required.");
      return;
    }
    if (runList.some((r) => !r.name.trim())) {
      toast.error("Every run-list row needs a compound.");
      return;
    }
    const payload: ScoutingPayload = {
      run_at: new Date(runAt).toISOString(),
      user_name: userName.trim(),
      flow_rate_ml_per_min: flowRate === "" ? null : Number(flowRate),
      temperature_c: temperature === "" ? null : Number(temperature),
      mobile_phase_a: mpA.trim() || DEFAULT_MP_A,
      mobile_phase_b: mpB.trim() || DEFAULT_MP_B,
      sample_diluent: diluent.trim() || null,
      comments: comments.trim() || null,
      gradient,
      run_list: runList,
    };
    onSubmit(payload);
    if (!editing) reset();
  }

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold">
          {editing ? "Edit entry" : "New entry"}
        </div>
        {editing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              onCancelEdit();
            }}
          >
            Cancel edit
          </Button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="grid md:grid-cols-6 gap-3">
        <Field className="md:col-span-2" label="Date & time" required>
          <Input
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
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
        <Field className="md:col-span-1" label="Flow rate (mL/min)">
          <Input
            type="number"
            step="0.01"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="e.g. 0.4"
          />
        </Field>
        <Field className="md:col-span-1" label="Temperature (°C)">
          <Input
            type="number"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="e.g. 40"
          />
        </Field>

        <Field className="md:col-span-3" label="Mobile Phase A">
          <Input
            value={mpA}
            onChange={(e) => setMpA(e.target.value)}
            maxLength={255}
          />
        </Field>
        <Field className="md:col-span-3" label="Mobile Phase B">
          <Input
            value={mpB}
            onChange={(e) => setMpB(e.target.value)}
            maxLength={255}
          />
        </Field>

        <Field className="md:col-span-6" label="Gradient">
          <GradientEditor rows={gradient} onChange={setGradient} />
        </Field>

        <Field className="md:col-span-6" label="Run List">
          <RunListEditor
            rows={runList}
            options={compoundOptions}
            onChange={setRunList}
            onCreateCompound={onCreateCompound}
          />
        </Field>

        <Field className="md:col-span-3" label="Sample diluent">
          <Input
            value={diluent}
            onChange={(e) => setDiluent(e.target.value)}
            maxLength={500}
            placeholder="e.g. 50:50 H2O/ACN"
          />
        </Field>
        <Field className="md:col-span-3" label="Comments">
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={1}
            maxLength={4000}
            placeholder="Anything noteworthy…"
          />
        </Field>

        <div className="md:col-span-6 flex justify-end gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : editing ? "Update entry" : "Save entry"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
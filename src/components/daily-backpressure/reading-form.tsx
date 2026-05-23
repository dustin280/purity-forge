import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
    });
    // reset
    setReadingAt(nowLocal());
    setBackpressure("");
    setNotes("");
  }

  return (
    <Card className="p-5 mb-6">
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

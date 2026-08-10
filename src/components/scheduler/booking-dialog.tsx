import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type { Instrument, InstrumentBooking } from "./use-scheduler";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

export interface BookingDialogValues {
  instrument_id: string;
  starts_at: string;
  ends_at: string;
  purpose: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instruments: Instrument[];
  defaultInstrumentId: string | null;
  initial: {
    starts_at: string;
    ends_at: string;
  };
  editing: InstrumentBooking | null;
  saving: boolean;
  deleting?: boolean;
  canDelete?: boolean;
  onSubmit: (v: BookingDialogValues) => void;
  onDelete?: () => void;
}

export function BookingDialog({
  open,
  onOpenChange,
  instruments,
  defaultInstrumentId,
  initial,
  editing,
  saving,
  deleting,
  canDelete,
  onSubmit,
  onDelete,
}: Props) {
  const active = useMemo(
    () => instruments.filter((i) => i.is_active),
    [instruments],
  );
  const [instrumentId, setInstrumentId] = useState<string>("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setInstrumentId(editing.instrument_id);
      setStarts(toLocalInput(editing.starts_at));
      setEnds(toLocalInput(editing.ends_at));
      setPurpose(editing.purpose);
      setNotes(editing.notes ?? "");
    } else {
      setInstrumentId(defaultInstrumentId || active[0]?.id || "");
      setStarts(toLocalInput(initial.starts_at));
      setEnds(toLocalInput(initial.ends_at));
      setPurpose("");
      setNotes("");
    }
  }, [open, editing, defaultInstrumentId, initial.starts_at, initial.ends_at, active]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instrumentId) return;
    onSubmit({
      instrument_id: instrumentId,
      starts_at: fromLocalInput(starts),
      ends_at: fromLocalInput(ends),
      purpose: purpose.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit booking" : "New booking"}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? "Edit an existing instrument booking" : "Reserve instrument time"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Instrument</Label>
            <Select value={instrumentId} onValueChange={setInstrumentId}>
              <SelectTrigger><SelectValue placeholder="Select instrument" /></SelectTrigger>
              <SelectContent>
                {active.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label className="text-xs">Purpose</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={80} required placeholder="e.g. Stability run – batch 0421" />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {editing && canDelete && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !instrumentId}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
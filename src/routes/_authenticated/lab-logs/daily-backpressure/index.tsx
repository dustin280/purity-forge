import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Gauge } from "lucide-react";
import {
  createBackpressureLog,
  deleteBackpressureLog,
  listBackpressureLogs,
} from "@/lib/daily-backpressure.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/logs/daily-backpressure/")({
  component: BackpressureLog,
});

const DEFAULT_INSTRUMENT = "Infinity III HPLC-DAD";

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function BackpressureLog() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const defaultName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";

  const list = useServerFn(listBackpressureLogs);
  const create = useServerFn(createBackpressureLog);
  const del = useServerFn(deleteBackpressureLog);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["daily-backpressure"],
    queryFn: () => list(),
  });

  const [readingAt, setReadingAt] = useState(nowLocal());
  const [userName, setUserName] = useState(defaultName);
  const [instrument, setInstrument] = useState(DEFAULT_INSTRUMENT);
  const [backpressure, setBackpressure] = useState("");
  const [unit, setUnit] = useState("bar");
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          reading_at: new Date(readingAt).toISOString(),
          user_name: userName,
          instrument,
          backpressure: Number(backpressure),
          backpressure_unit: unit,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Reading logged");
      setReadingAt(nowLocal());
      setBackpressure("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["daily-backpressure"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["daily-backpressure"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userName.trim() || !instrument.trim() || backpressure === "" || Number.isNaN(Number(backpressure))) {
      toast.error("Fill in all required fields.");
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/lab-logs"><Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back to Logs</Button></Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Daily Backpressure Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Quick daily readings from the HPLC system.</p>
      </div>

      {canCreate && (
        <Card className="p-5 mb-6">
          <form onSubmit={onSubmit} className="grid md:grid-cols-6 gap-3 items-end">
            <Field className="md:col-span-2" label="Date & time" required>
              <Input type="datetime-local" value={readingAt} onChange={e => setReadingAt(e.target.value)} required />
            </Field>
            <Field className="md:col-span-2" label="User" required>
              <Input value={userName} onChange={e => setUserName(e.target.value)} placeholder="First Last" required maxLength={255} />
            </Field>
            <Field className="md:col-span-2" label="Instrument" required>
              <Input value={instrument} onChange={e => setInstrument(e.target.value)} required maxLength={255} />
            </Field>
            <Field className="md:col-span-2" label="Backpressure" required>
              <Input
                type="number"
                step="0.1"
                value={backpressure}
                onChange={e => setBackpressure(e.target.value)}
                placeholder="e.g. 320"
                required
              />
            </Field>
            <Field className="md:col-span-1" label="Unit">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">bar</SelectItem>
                  <SelectItem value="psi">psi</SelectItem>
                  <SelectItem value="MPa">MPa</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="md:col-span-3" label="Notes (optional)">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={1} maxLength={2000} placeholder="Anything noteworthy…" />
            </Field>
            <div className="md:col-span-6 flex justify-end">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Add Reading"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Readings
        </div>
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Gauge className="size-8 mx-auto text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground">No readings logged yet.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Date / Time</th>
                  <th className="text-left font-medium px-4 py-2">User</th>
                  <th className="text-left font-medium px-4 py-2">Instrument</th>
                  <th className="text-right font-medium px-4 py-2">Backpressure</th>
                  <th className="text-left font-medium px-4 py-2">Notes</th>
                  {isAdmin && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(r.reading_at).toLocaleString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.user_name}</td>
                    <td className="px-4 py-2">{r.instrument}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.backpressure} <span className="text-muted-foreground">{r.backpressure_unit}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.notes ?? "—"}</td>
                    {isAdmin && (
                      <td className="px-2 py-2">
                        <Button
                          size="icon" variant="ghost"
                          className="size-7 text-destructive"
                          disabled={deleteMut.isPending}
                          onClick={() => { if (confirm("Delete this reading?")) deleteMut.mutate(r.id); }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
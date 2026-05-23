import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createSample, listParameters } from "@/lib/lims.functions";
import { generateBatchId } from "@/lib/lims-utils";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { SampleBasicFields } from "@/components/samples/basic-fields";
import { ParameterPicker } from "@/components/samples/parameter-picker";
export const Route = createFileRoute("/_authenticated/samples/new")({ component: NewSample });

function NewSample() {
  const nav = useNavigate();
  const { role } = useAuth();
  const fn = useServerFn(createSample);
  const listParams = useServerFn(listParameters);
  const { data: allParams = [] } = useQuery({
    queryKey: qk.testParameters.list(),
    queryFn: () => listParams(),
  });
  const activeParams = allParams.filter(p => p.is_active);
  const [batch, setBatch] = useState(generateBatchId());
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [receipt, setReceipt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleParam(name: string) {
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await fn({ data: {
        batch_id: batch, client, project: project || null,
        receipt_date: receipt, notes: notes || null,
        parameters: selected,
      } });
      toast.success(`Sample ${s.batch_id} registered`);
      nav({ to: "/samples/$batchId", params: { batchId: s.batch_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sample");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Intake</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">New Sample</h1>
        <p className="text-sm text-muted-foreground mt-1">Register a specimen for HPLC-DAD analysis. A default test will be auto-assigned.</p>
      </div>
      <Card className="p-6 border-border">
        <form onSubmit={onSubmit} className="space-y-5">
          <SampleBasicFields
            batch={batch} setBatch={setBatch}
            client={client} setClient={setClient}
            project={project} setProject={setProject}
            receipt={receipt} setReceipt={setReceipt}
          />
          <ParameterPicker
            params={activeParams}
            selected={selected}
            onToggle={toggleParam}
            isAdmin={role === "admin"}
          />
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Register Sample"}</Button>
            <Button type="button" variant="outline" onClick={() => nav({ to: "/samples" })}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
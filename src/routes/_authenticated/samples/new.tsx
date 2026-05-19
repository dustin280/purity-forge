import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { createSample } from "@/lib/lims.functions";
import { generateBatchId } from "@/lib/lims-utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/samples/new")({ component: NewSample });

function NewSample() {
  const nav = useNavigate();
  const fn = useServerFn(createSample);
  const [batch, setBatch] = useState(generateBatchId());
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [receipt, setReceipt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await fn({ data: { batch_id: batch, client, project: project || null, receipt_date: receipt, notes: notes || null } });
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
          <div className="space-y-1.5">
            <Label htmlFor="batch">Batch ID</Label>
            <div className="flex gap-2">
              <Input id="batch" required value={batch} onChange={e => setBatch(e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => setBatch(generateBatchId())}>
                <Sparkles className="size-4 mr-1" />Generate
              </Button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="client">Client</Label>
              <Input id="client" required value={client} onChange={e => setClient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project">Project (optional)</Label>
              <Input id="project" value={project} onChange={e => setProject(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receipt">Receipt Date</Label>
            <Input id="receipt" type="date" required value={receipt} onChange={e => setReceipt(e.target.value)} />
          </div>
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
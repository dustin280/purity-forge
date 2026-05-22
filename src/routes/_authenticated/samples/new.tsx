import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createSample, listParameters } from "@/lib/lims.functions";
import { generateBatchId } from "@/lib/lims-utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
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
  const [paramFilter, setParamFilter] = useState("");
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

  const filteredParams = activeParams.filter(p =>
    p.name.toLowerCase().includes(paramFilter.toLowerCase())
  );

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Test Parameters {selected.length > 0 && <span className="text-muted-foreground font-normal">({selected.length} selected)</span>}</Label>
              {role === "admin" && (
                <Link to="/admin/parameters" className="text-xs text-muted-foreground hover:text-foreground underline">
                  Manage list
                </Link>
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map(name => (
                  <Badge key={name} variant="secondary" className="gap-1">
                    {name}
                    <button type="button" onClick={() => toggleParam(name)} className="hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              placeholder={`Filter ${activeParams.length} parameters…`}
              value={paramFilter}
              onChange={e => setParamFilter(e.target.value)}
              className="h-8"
            />
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {filteredParams.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No parameters available.</div>
              ) : filteredParams.map(p => {
                const checked = selected.includes(p.name);
                return (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={checked} onCheckedChange={() => toggleParam(p.name)} />
                    <span>{p.name}</span>
                  </label>
                );
              })}
            </div>
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
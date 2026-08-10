import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import {
  listSolventFormulations, createFormulation, setFormulationStatus,
  listReagentLots, createReagentLot,
} from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/solvents")({
  head: () => ({ meta: [
    { title: "Solvents · Sample Prep" },
    { name: "description", content: "Solvent formulations and prepared reagent lots for method-driven preparations." },
    { property: "og:title", content: "Solvents" },
    { property: "og:description", content: "Solvent formulations and lot tracking." },
  ]}),
  component: SolventsPage,
});

type Basis = "v/v"|"w/v"|"w/w"|"molar";
type Comp = { component_name: string; percentage: number | null; percentage_basis: Basis | null; notes: string | null };

function SolventsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sp-formulations"], queryFn: () => listSolventFormulations() });
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<{ name: string; internal_code: string; version: string; storage_conditions: string; stability_period_days: string; approved_uses: string; notes: string }>({ name: "", internal_code: "", version: "", storage_conditions: "", stability_period_days: "", approved_uses: "", notes: "" });
  const [components, setComponents] = useState<Comp[]>([{ component_name: "", percentage: null, percentage_basis: "v/v", notes: null }]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      await createFormulation({ data: {
        values: {
          name: form.name.trim(),
          internal_code: form.internal_code || null,
          version: form.version || null,
          storage_conditions: form.storage_conditions || null,
          stability_period_days: form.stability_period_days ? Number(form.stability_period_days) : null,
          approved_uses: form.approved_uses || null,
          notes: form.notes || null,
        },
        components: components.filter(c => c.component_name.trim()).map(c => ({
          component_name: c.component_name.trim(),
          percentage: c.percentage,
          percentage_basis: c.percentage_basis,
          notes: c.notes,
        })),
      }});
    },
    onSuccess: () => {
      toast.success("Formulation created");
      qc.invalidateQueries({ queryKey: ["sp-formulations"] });
      qc.invalidateQueries({ queryKey: ["sp-counts"] });
      setShowNew(false);
      setForm({ name: "", internal_code: "", version: "", storage_conditions: "", stability_period_days: "", approved_uses: "", notes: "" });
      setComponents([{ component_name: "", percentage: null, percentage_basis: "v/v", notes: null }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft"|"approved"|"retired" }) => setFormulationStatus({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sp-formulations"] }),
  });

  return (
    <SamplePrepShell title="Solvents" description="Recipes (formulations) and prepared batches (lots). A method references a formulation; the technician selects the specific lot at prep time.">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-3 lg:col-span-2">
          <div className="flex justify-between items-center">
            <div className="text-sm font-medium">Formulations</div>
            <Button size="sm" onClick={() => setShowNew(true)}><Plus className="size-4 mr-1" /> New formulation</Button>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Version</TableHead>
                <TableHead>Components</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(data?.formulations ?? []).map(f => {
                  const comps = (data?.components ?? []).filter(c => c.formulation_id === f.id);
                  return (
                    <TableRow key={f.id} onClick={() => setSelected(f.id)} className={`cursor-pointer ${selected === f.id ? "bg-muted/60" : ""}`}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>{f.internal_code ?? "—"}</TableCell>
                      <TableCell>{f.version ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{comps.map(c => `${c.component_name}${c.percentage != null ? ` ${c.percentage}%` : ""}`).join(", ") || "—"}</TableCell>
                      <TableCell><Badge variant={f.status === "approved" ? "default" : f.status === "retired" ? "outline" : "secondary"}>{f.status}</Badge></TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Select value={f.status} onValueChange={v => setStatus.mutate({ id: f.id, status: v as "draft"|"approved"|"retired" })}>
                          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="retired">Retired</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!data?.formulations.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No formulations yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Lots</div>
          {selected ? <LotsPanel formulationId={selected} /> : <div className="text-xs text-muted-foreground">Select a formulation to view or add lots.</div>}
        </Card>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New solvent formulation</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new solvent formulation
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Internal code</Label><Input value={form.internal_code} onChange={e => setForm({ ...form, internal_code: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Version</Label><Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Storage conditions</Label><Input value={form.storage_conditions} onChange={e => setForm({ ...form, storage_conditions: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Stability (days)</Label><Input type="number" value={form.stability_period_days} onChange={e => setForm({ ...form, stability_period_days: e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Approved uses</Label><Input value={form.approved_uses} onChange={e => setForm({ ...form, approved_uses: e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center"><Label className="text-xs">Components</Label>
              <Button size="sm" variant="outline" onClick={() => setComponents([...components, { component_name: "", percentage: null, percentage_basis: "v/v", notes: null }])}><Plus className="size-3 mr-1" /> Add</Button>
            </div>
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="Component" value={c.component_name} onChange={e => setComponents(components.map((x, j) => j === i ? { ...x, component_name: e.target.value } : x))} />
                <Input className="col-span-2" type="number" step="any" placeholder="%" value={c.percentage ?? ""} onChange={e => setComponents(components.map((x, j) => j === i ? { ...x, percentage: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                <Select value={c.percentage_basis ?? "v/v"} onValueChange={v => setComponents(components.map((x, j) => j === i ? { ...x, percentage_basis: v as Basis } : x))}>
                  <SelectTrigger className="col-span-2 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="v/v">v/v</SelectItem>
                    <SelectItem value="w/v">w/v</SelectItem>
                    <SelectItem value="w/w">w/w</SelectItem>
                    <SelectItem value="molar">molar</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="col-span-2" placeholder="notes" value={c.notes ?? ""} onChange={e => setComponents(components.map((x, j) => j === i ? { ...x, notes: e.target.value || null } : x))} />
                <Button className="col-span-1" size="sm" variant="ghost" onClick={() => setComponents(components.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SamplePrepShell>
  );
}

function LotsPanel({ formulationId }: { formulationId: string }) {
  const qc = useQueryClient();
  const { data: lots = [] } = useQuery({ queryKey: ["sp-lots", formulationId], queryFn: () => listReagentLots({ data: { formulation_id: formulationId } }) });
  const [lot, setLot] = useState("");
  const [prep, setPrep] = useState("");
  const [exp, setExp] = useState("");
  const add = useMutation({
    mutationFn: async () => createReagentLot({ data: { formulation_id: formulationId, lot_number: lot.trim(), preparation_date: prep || null, expiration_date: exp || null } }),
    onSuccess: () => { setLot(""); setPrep(""); setExp(""); qc.invalidateQueries({ queryKey: ["sp-lots", formulationId] }); toast.success("Lot added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Input placeholder="Lot number" value={lot} onChange={e => setLot(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[10px]">Prep date</Label><Input type="date" value={prep} onChange={e => setPrep(e.target.value)} /></div>
          <div><Label className="text-[10px]">Expiry</Label><Input type="date" value={exp} onChange={e => setExp(e.target.value)} /></div>
        </div>
        <Button size="sm" className="w-full" disabled={!lot.trim() || add.isPending} onClick={() => add.mutate()}>Add lot</Button>
      </div>
      <div className="border-t pt-2 space-y-1 max-h-80 overflow-y-auto">
        {lots.map(l => (
          <div key={l.id} className="text-xs p-2 rounded border">
            <div className="font-medium">{l.lot_number}</div>
            <div className="text-muted-foreground">Prep: {l.preparation_date ?? "—"} · Exp: {l.expiration_date ?? "—"}</div>
            <Badge variant={l.review_status === "approved" ? "default" : l.review_status === "rejected" ? "destructive" : "secondary"} className="mt-1">{l.review_status}</Badge>
          </div>
        ))}
        {!lots.length && <div className="text-xs text-muted-foreground">No lots recorded.</div>}
      </div>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Pencil, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { listAnalytes, getAnalyte, createAnalyte, updateAnalyte, addAnalyteAlias, removeAnalyteAlias, type Analyte } from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/analytes")({
  head: () => ({ meta: [
    { title: "Analytes · Sample Prep" },
    { name: "description", content: "Manage analytes and aliases for method-driven sample preparation." },
    { property: "og:title", content: "Analytes" },
    { property: "og:description", content: "Analyte master data for the Synthesyx LIMS." },
  ]}),
  component: AnalytesPage,
});

type FormState = Partial<Analyte>;

function AnalytesPage() {
  const qc = useQueryClient();
  const { data: analytes = [] } = useQuery({ queryKey: ["sp-analytes"], queryFn: () => listAnalytes() });
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Analyte | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FormState>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return analytes.filter(a =>
      (showInactive || a.is_active) &&
      (!q || a.canonical_name.toLowerCase().includes(q) || (a.abbreviation ?? "").toLowerCase().includes(q))
    );
  }, [analytes, query, showInactive]);

  function openNew() { setIsNew(true); setEditing(null); setForm({ is_active: true }); }
  function openEdit(a: Analyte) { setIsNew(false); setEditing(a); setForm({ ...a }); }
  function close() { setIsNew(false); setEditing(null); setForm({}); }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.canonical_name?.trim()) throw new Error("Canonical name is required");
      const clean = { ...form } as Record<string, unknown>;
      // strip empty strings → null
      for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
      if (editing) {
        await updateAnalyte({ data: { id: editing.id, patch: clean as never } });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createAnalyte({ data: clean as any });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Analyte updated" : "Analyte created");
      qc.invalidateQueries({ queryKey: ["sp-analytes"] });
      qc.invalidateQueries({ queryKey: ["sp-counts"] });
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title="Analytes" description="Canonical analyte records. Add aliases to track alternate names without merging distinct forms (e.g. keep BPC-157 Acetate and BPC-157 free form separate).">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or abbreviation" className="pl-8" />
          </div>
          <label className="text-xs flex items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> show inactive
          </label>
          <Button size="sm" onClick={openNew}><Plus className="size-4 mr-1" /> Add analyte</Button>
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canonical name</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>CAS</TableHead>
                <TableHead>MW</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{a.canonical_name}</TableCell>
                  <TableCell>{a.abbreviation ?? "—"}</TableCell>
                  <TableCell>{a.category ?? "—"}</TableCell>
                  <TableCell>{a.cas_number ?? "—"}</TableCell>
                  <TableCell>{a.molecular_weight ?? "—"}</TableCell>
                  <TableCell>{a.is_active ? <Badge variant="secondary">active</Badge> : <Badge variant="outline">inactive</Badge>}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="size-4" /></Button></TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No analytes match.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isNew || !!editing} onOpenChange={o => !o && close()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit analyte" : "New analyte"}</DialogTitle>
            <DialogDescription>Distinct forms (salt vs free base, fragment vs full-length) must remain separate records.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Field label="Canonical name" required>
              <Input value={form.canonical_name ?? ""} onChange={e => setForm({ ...form, canonical_name: e.target.value })} />
            </Field>
            <Field label="Abbreviation"><Input value={form.abbreviation ?? ""} onChange={e => setForm({ ...form, abbreviation: e.target.value })} /></Field>
            <Field label="Category"><Input value={form.category ?? ""} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="peptide, small molecule…" /></Field>
            <Field label="Salt / form"><Input value={form.salt_form ?? ""} onChange={e => setForm({ ...form, salt_form: e.target.value })} /></Field>
            <Field label="CAS number"><Input value={form.cas_number ?? ""} onChange={e => setForm({ ...form, cas_number: e.target.value })} /></Field>
            <Field label="Molecular formula"><Input value={form.molecular_formula ?? ""} onChange={e => setForm({ ...form, molecular_formula: e.target.value })} /></Field>
            <Field label="Molecular weight"><Input type="number" step="any" value={form.molecular_weight ?? ""} onChange={e => setForm({ ...form, molecular_weight: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="Default mass unit"><Input value={form.default_mass_unit ?? ""} onChange={e => setForm({ ...form, default_mass_unit: e.target.value })} placeholder="mg" /></Field>
            <Field label="Default concentration unit"><Input value={form.default_concentration_unit ?? ""} onChange={e => setForm({ ...form, default_concentration_unit: e.target.value })} placeholder="mg/mL" /></Field>
            <Field label="Solvent recommendations"><Input value={form.default_solvent_recommendations ?? ""} onChange={e => setForm({ ...form, default_solvent_recommendations: e.target.value })} /></Field>
            <Field label="Sequence" wide><Textarea value={form.sequence ?? ""} onChange={e => setForm({ ...form, sequence: e.target.value })} rows={2} /></Field>
            <Field label="Description" wide><Textarea value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
            <Field label="Solubility notes" wide><Textarea value={form.solubility_notes ?? ""} onChange={e => setForm({ ...form, solubility_notes: e.target.value })} rows={2} /></Field>
            <Field label="Stability / storage" wide>
              <div className="grid grid-cols-2 gap-2">
                <Textarea value={form.stability_notes ?? ""} onChange={e => setForm({ ...form, stability_notes: e.target.value })} rows={2} placeholder="Stability" />
                <Textarea value={form.storage_notes ?? ""} onChange={e => setForm({ ...form, storage_notes: e.target.value })} rows={2} placeholder="Storage" />
              </div>
            </Field>
            <Field label="Handling precautions" wide><Textarea value={form.handling_notes ?? ""} onChange={e => setForm({ ...form, handling_notes: e.target.value })} rows={2} /></Field>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input id="is_active" type="checkbox" checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <Label htmlFor="is_active">Active (uncheck to deactivate)</Label>
            </div>
          </div>
          {editing && <AliasesEditor analyteId={editing.id} />}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SamplePrepShell>
  );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

function AliasesEditor({ analyteId }: { analyteId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sp-analyte", analyteId], queryFn: () => getAnalyte({ data: { id: analyteId } }) });
  const [alias, setAlias] = useState("");
  const add = useMutation({
    mutationFn: async () => addAnalyteAlias({ data: { analyte_id: analyteId, alias } }),
    onSuccess: () => { setAlias(""); qc.invalidateQueries({ queryKey: ["sp-analyte", analyteId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rm = useMutation({
    mutationFn: async (id: string) => removeAnalyteAlias({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sp-analyte", analyteId] }),
  });
  return (
    <div className="mt-4 border-t pt-3 space-y-2">
      <div className="text-xs font-medium flex items-center gap-1.5"><Tag className="size-3.5" /> Aliases</div>
      <div className="flex gap-2">
        <Input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Add alias…" />
        <Button size="sm" onClick={() => alias.trim() && add.mutate()} disabled={add.isPending}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(data?.aliases ?? []).map(a => (
          <Badge key={a.id} variant="secondary" className="gap-1">
            {a.alias}
            <button className="ml-1 text-xs opacity-60 hover:opacity-100" onClick={() => rm.mutate(a.id)}>×</button>
          </Badge>
        ))}
        {!data?.aliases.length && <span className="text-xs text-muted-foreground">No aliases yet.</span>}
      </div>
    </div>
  );
}
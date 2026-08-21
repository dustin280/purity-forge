import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, ChevronRight, ShieldAlert } from "lucide-react";
import { listNcCompounds, addNcCompound } from "@/lib/non-conformity/nc-library.functions";

export const Route = createFileRoute("/_authenticated/non-conformity/library")({
  component: NcLibraryPage,
});

function NcLibraryPage() {
  const qc = useQueryClient();
  const list = useServerFn(listNcCompounds);
  const add = useServerFn(addNcCompound);
  const { data: compounds = [], isLoading } = useQuery({
    queryKey: ["nc-compounds", "list"],
    queryFn: () => list(),
  });
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const addMut = useMutation({
    mutationFn: (payload: { name: string; class?: string | null; molecular_formula?: string | null; dad_guidance?: string | null; form_notes?: string | null }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      add({ data: payload as any }),
    onSuccess: () => {
      toast.success("Compound added");
      qc.invalidateQueries({ queryKey: ["nc-compounds"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = compounds.filter(c =>
    !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || (c.class ?? "").toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <ShieldAlert className="size-3" /> Non-Conformity Identifier
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Impurity &amp; Oligomer Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reference compounds screened by the Non-Conformity Identifier — impurities, degradants, and oligomer/aggregation candidates.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="size-4 mr-1" /> Add Compound</Button>
      </div>

      <Card className="p-3 flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search compound name or class…" className="border-0 shadow-none focus-visible:ring-0" />
      </Card>

      <Card className="p-0 overflow-hidden divide-y divide-border">
        {isLoading && <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>}
        {!isLoading && filtered.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No compounds match.</div>}
        {filtered.map(c => (
          <Link key={c.id} to="/non-conformity/library/$compoundId" params={{ compoundId: c.id }}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
            <div>
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.class ?? "—"}{c.molecular_formula ? ` · ${c.molecular_formula}` : ""}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>

      <AddCompoundDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={addMut.mutate} submitting={addMut.isPending} />
    </div>
  );
}

function AddCompoundDialog({ open, onClose, onSubmit, submitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (d: { name: string; class?: string | null; molecular_formula?: string | null; dad_guidance?: string | null; form_notes?: string | null }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [formula, setFormula] = useState("");
  const [dadGuidance, setDadGuidance] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    onSubmit({
      name: name.trim(), class: cls.trim() || null, molecular_formula: formula.trim() || null,
      dad_guidance: dadGuidance.trim() || null, form_notes: notes.trim() || null,
    });
    setName(""); setCls(""); setFormula(""); setDadGuidance(""); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Compound</DialogTitle>
          <DialogDescription>Adds a new parent compound to the Non-Conformity Identifier library. Add impurity/oligomer candidates from its detail page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Class</Label>
            <Input value={cls} onChange={e => setCls(e.target.value)} placeholder="e.g. Peptide, Small molecule" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Molecular formula</Label>
            <Input value={formula} onChange={e => setFormula(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">DAD guidance</Label>
            <Textarea rows={2} value={dadGuidance} onChange={e => setDadGuidance(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

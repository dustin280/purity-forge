import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, Plus } from "lucide-react";
import { getNcCompoundDetail, addNcImpurityCandidate, addNcOligomerCandidate } from "@/lib/non-conformity/nc-library.functions";

/** Row shape for tables not yet in the generated Supabase types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const Route = createFileRoute("/_authenticated/non-conformity/library/$compoundId")({
  component: NcCompoundDetail,
});

function NcCompoundDetail() {
  const { compoundId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getNcCompoundDetail);
  const addImpurity = useServerFn(addNcImpurityCandidate);
  const addOligomer = useServerFn(addNcOligomerCandidate);

  const { data, isLoading } = useQuery({
    queryKey: ["nc-compound", compoundId],
    queryFn: () => get({ data: { id: compoundId } }),
  });

  const [addKind, setAddKind] = useState<"impurity" | "oligomer" | null>(null);

  const addImpurityMut = useMutation({
    mutationFn: (payload: { nc_compound_id: string; impurity_code: string; name: string; evidence_level?: string | null; rp_hplc_behavior?: string | null; notes?: string | null }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addImpurity({ data: payload as any }),
    onSuccess: () => { toast.success("Impurity candidate added"); qc.invalidateQueries({ queryKey: ["nc-compound", compoundId] }); setAddKind(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addOligomerMut = useMutation({
    mutationFn: (payload: { nc_compound_id: string; oligomer_code: string; name: string; evidence_level?: string | null; rp_hplc_behavior?: string | null; false_positive_warning?: string | null; notes?: string | null }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addOligomer({ data: payload as any }),
    onSuccess: () => { toast.success("Oligomer candidate added"); qc.invalidateQueries({ queryKey: ["nc-compound", compoundId] }); setAddKind(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-destructive">Compound not found.</div>;

  const { compound, impurities, oligomers, panel } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      <Link to="/non-conformity/library" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Non-Conformity Library
      </Link>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{compound.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{compound.class ?? "—"}{compound.molecular_formula ? ` · ${compound.molecular_formula}` : ""}</p>
        {compound.dad_guidance && <p className="text-xs text-muted-foreground mt-2 max-w-2xl">{compound.dad_guidance}</p>}
      </div>

      {panel && (
        <Card className="p-4 space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spectral Panel</h2>
          <div className="text-sm font-mono">{(panel.wavelengths_nm ?? []).join(" / ")} nm</div>
          {panel.recommended_features && <div className="text-xs text-muted-foreground">{panel.recommended_features}</div>}
          {panel.panel_rationale && <div className="text-xs text-muted-foreground mt-1">{panel.panel_rationale}</div>}
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Impurity Candidates ({impurities.length})</h2>
        <Button size="sm" variant="outline" onClick={() => setAddKind("impurity")}><Plus className="size-3.5 mr-1" /> Add Impurity</Button>
      </div>
      <Card className="p-0 overflow-hidden divide-y divide-border">
        {impurities.length === 0 && <div className="p-4 text-sm text-muted-foreground">None on file.</div>}
        {impurities.map((c: Row) => (
          <div key={c.id} className="p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              {c.evidence_level && <Badge variant="outline" className="text-[10px]">{c.evidence_level}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{c.rp_hplc_behavior ?? "—"}</div>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Oligomer / Aggregation Candidates ({oligomers.length})</h2>
        <Button size="sm" variant="outline" onClick={() => setAddKind("oligomer")}><Plus className="size-3.5 mr-1" /> Add Oligomer</Button>
      </div>
      <Card className="p-0 overflow-hidden divide-y divide-border">
        {oligomers.length === 0 && <div className="p-4 text-sm text-muted-foreground">None on file.</div>}
        {oligomers.map((c: Row) => (
          <div key={c.id} className="p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              {c.evidence_level && <Badge variant="outline" className="text-[10px]">{c.evidence_level}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{c.rp_hplc_behavior ?? "—"}</div>
            {c.false_positive_warning && <div className="text-xs text-amber-600">⚠ {c.false_positive_warning}</div>}
          </div>
        ))}
      </Card>

      <AddCandidateDialog
        kind={addKind}
        onClose={() => setAddKind(null)}
        onSubmitImpurity={(d) => addImpurityMut.mutate({ ...d, nc_compound_id: compoundId })}
        onSubmitOligomer={(d) => addOligomerMut.mutate({ ...d, nc_compound_id: compoundId })}
        submitting={addImpurityMut.isPending || addOligomerMut.isPending}
      />
    </div>
  );
}

function AddCandidateDialog({ kind, onClose, onSubmitImpurity, onSubmitOligomer, submitting }: {
  kind: "impurity" | "oligomer" | null;
  onClose: () => void;
  onSubmitImpurity: (d: { impurity_code: string; name: string; evidence_level?: string | null; rp_hplc_behavior?: string | null; notes?: string | null }) => void;
  onSubmitOligomer: (d: { oligomer_code: string; name: string; evidence_level?: string | null; rp_hplc_behavior?: string | null; false_positive_warning?: string | null; notes?: string | null }) => void;
  submitting: boolean;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [evidenceLevel, setEvidenceLevel] = useState("");
  const [behavior, setBehavior] = useState("");
  const [warning, setWarning] = useState("");
  const [notes, setNotes] = useState("");

  function reset() { setCode(""); setName(""); setEvidenceLevel(""); setBehavior(""); setWarning(""); setNotes(""); }

  function submit() {
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    if (kind === "impurity") {
      onSubmitImpurity({ impurity_code: code.trim(), name: name.trim(), evidence_level: evidenceLevel.trim() || null, rp_hplc_behavior: behavior.trim() || null, notes: notes.trim() || null });
    } else if (kind === "oligomer") {
      onSubmitOligomer({ oligomer_code: code.trim(), name: name.trim(), evidence_level: evidenceLevel.trim() || null, rp_hplc_behavior: behavior.trim() || null, false_positive_warning: warning.trim() || null, notes: notes.trim() || null });
    }
    reset();
  }

  return (
    <Dialog open={kind !== null} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {kind === "impurity" ? "Impurity" : "Oligomer"} Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Code *</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. COMPOUND-001" className="mt-1" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Evidence level</Label>
            <Input value={evidenceLevel} onChange={e => setEvidenceLevel(e.target.value)} placeholder="Reported/known, Strongly plausible, Generic chemistry candidate…" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">RP-HPLC behavior</Label>
            <Textarea rows={2} value={behavior} onChange={e => setBehavior(e.target.value)} className="mt-1" />
          </div>
          {kind === "oligomer" && (
            <div>
              <Label className="text-xs">False-positive warning</Label>
              <Textarea rows={2} value={warning} onChange={e => setWarning(e.target.value)} className="mt-1" />
            </div>
          )}
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

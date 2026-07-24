import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { listMethods, createMethod } from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/methods")({
  head: () => ({ meta: [
    { title: "Methods · Sample Prep" },
    { name: "description", content: "Analytical methods, revisions, calibrations, and sample-preparation rules." },
    { property: "og:title", content: "Methods" },
    { property: "og:description", content: "Method master data for the Synthesyx LIMS." },
  ]}),
  component: MethodsListPage,
});

function MethodsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["sp-methods"], queryFn: () => listMethods() });
  const [q, setQ] = useState("");
  const [filterAnalyte, setFilterAnalyte] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<{ analyte_id: string; name: string; code: string; method_type: string; intended_use: string }>({ analyte_id: "", name: "", code: "", method_type: "", intended_use: "" });

  const methods = data?.methods ?? [];
  const revs = data?.revisions ?? [];
  const analytes = data?.analytes ?? [];
  const activeByMethod = useMemo(() => {
    const map = new Map<string, typeof revs[number]>();
    for (const r of revs) {
      const cur = map.get(r.method_id);
      if (!cur) map.set(r.method_id, r);
    }
    return map;
  }, [revs]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return methods
      .filter(m => !filterAnalyte || m.analyte_id === filterAnalyte)
      .filter(m => {
        if (!filterStatus) return true;
        return activeByMethod.get(m.id)?.status === filterStatus;
      })
      .filter(m => !qq || m.name.toLowerCase().includes(qq) || (m.code ?? "").toLowerCase().includes(qq));
  }, [methods, activeByMethod, q, filterAnalyte, filterStatus]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.analyte_id || !form.name.trim()) throw new Error("Analyte and name required");
      return createMethod({ data: {
        analyte_id: form.analyte_id,
        name: form.name.trim(),
        code: form.code.trim() || null,
        method_type: form.method_type.trim() || null,
        intended_use: form.intended_use.trim() || null,
      }});
    },
    onSuccess: (res) => {
      toast.success("Method created");
      qc.invalidateQueries({ queryKey: ["sp-methods"] });
      qc.invalidateQueries({ queryKey: ["sp-counts"] });
      setShowNew(false);
      setForm({ analyte_id: "", name: "", code: "", method_type: "", intended_use: "" });
      navigate({ to: "/sample-prep/methods/$id", params: { id: res.method.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title="Methods" description="Each method captures chromatographic conditions, gradient, calibration levels (Level 3 is the default prep target), and sample-preparation rules. Approved revisions supersede earlier ones automatically.">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code" className="pl-8" />
          </div>
          <div className="w-56">
            <Label className="text-xs">Analyte</Label>
            <Select value={filterAnalyte || "__all"} onValueChange={v => setFilterAnalyte(v === "__all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All analytes</SelectItem>
                {analytes.map(a => <SelectItem key={a.id} value={a.id}>{a.canonical_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus || "__all"} onValueChange={v => setFilterStatus(v === "__all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="superseded">Superseded</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="size-4 mr-1" /> New method</Button>
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Analyte</TableHead>
                <TableHead>Latest rev</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Column</TableHead>
                <TableHead>RT (min)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(m => {
                const rev = activeByMethod.get(m.id);
                const analyte = analytes.find(a => a.id === m.analyte_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell>{m.code ?? "—"}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{analyte?.canonical_name ?? "—"}</TableCell>
                    <TableCell>{rev ? `v${rev.version}.${rev.revision}` : "—"}</TableCell>
                    <TableCell>{rev?.status ? <StatusBadge status={rev.status} /> : "—"}</TableCell>
                    <TableCell>{rev?.column_name ?? "—"}</TableCell>
                    <TableCell>{rev?.estimated_rt_min ?? "—"}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/sample-prep/methods/$id" params={{ id: m.id }}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No methods yet. Click “New method” to create one.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>New method</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Analyte *</Label>
              <Select value={form.analyte_id} onValueChange={v => setForm({ ...form, analyte_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select analyte" /></SelectTrigger>
                <SelectContent>{analytes.map(a => <SelectItem key={a.id} value={a.id}>{a.canonical_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Method name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Method code</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. GEN-AQ-01" /></div>
              <div className="space-y-1"><Label className="text-xs">Type</Label><Input value={form.method_type} onChange={e => setForm({ ...form, method_type: e.target.value })} placeholder="purity, assay…" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Intended use</Label><Input value={form.intended_use} onChange={e => setForm({ ...form, intended_use: e.target.value })} /></div>
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

function StatusBadge({ status }: { status: string }) {
  const v = status === "approved" ? "default" : status === "draft" ? "outline" : "secondary";
  return <Badge variant={v as "default"|"outline"|"secondary"}>{status.replace("_"," ")}</Badge>;
}
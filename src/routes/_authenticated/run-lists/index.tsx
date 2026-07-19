import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Download, Wand2 } from "lucide-react";
import { createRunList, deleteRunList, listRunLists } from "@/lib/run-lists.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/run-lists/")({
  component: RunListsIndex,
});

function RunListsIndex() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listRunLists);
  const create = useServerFn(createRunList);
  const del = useServerFn(deleteRunList);
  const { data, isLoading } = useQuery({ queryKey: qk.runLists.list(), queryFn: () => list() });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), starting_vial: 1, inj_per_vial: 1, data_file_pattern: "{sample}_{yyyyMMdd}_{seq}" } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.runLists.all });
      setOpen(false); setName("");
      navigate({ to: "/run-lists/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.runLists.all }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Instrument Worklists</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Run Lists</h1>
          <p className="text-sm text-muted-foreground mt-1">Assemble prep-flagged samples into an OpenLab CDS sequence CSV.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/run-lists/generate"><Wand2 className="size-4 mr-1" />Generate from queue</Link></Button>
          <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" />New Run List</Button>
        </div>
      </div>

      <Card className="border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Method</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Exported</th>
              <th className="text-left px-4 py-3 font-semibold">Created</th>
              <th className="text-right px-4 py-3 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No run lists yet.</td></tr>
            )}
            {(data ?? []).map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link to="/run-lists/$id" params={{ id: r.id }} className="font-semibold text-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.method_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${r.status === "exported" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.exported_at ? new Date(r.exported_at).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${r.name}"?`)) delMut.mutate(r.id); }}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Run List</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tuesday peptide batch" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              <Download className="size-4 mr-1" />Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
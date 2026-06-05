import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Plus, Trash2, ArrowLeft, FileText } from "lucide-react";
import {
  getRunList, updateRunList, addSamplesToRunList, removeRunListItem,
  generateRunListCsv, listPrepFlaggedSamples, markRunListSent,
} from "@/lib/run-lists.functions";
import { useInstruments } from "@/components/scheduler/use-scheduler";
import { useOpenLabMethods } from "@/components/instrument-comm/use-openlab";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/run-lists/$id")({
  component: RunListDetail,
});

function RunListDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getRunList);
  const update = useServerFn(updateRunList);
  const addSamples = useServerFn(addSamplesToRunList);
  const removeItem = useServerFn(removeRunListItem);
  const genCsv = useServerFn(generateRunListCsv);
  const markSent = useServerFn(markRunListSent);
  const listPrep = useServerFn(listPrepFlaggedSamples);
  const instruments = useInstruments?.();
  const methods = useOpenLabMethods();

  const { data, isLoading } = useQuery({ queryKey: qk.runLists.detail(id), queryFn: () => get({ data: { id } }) });
  const { data: prepSamples } = useQuery({ queryKey: qk.runLists.prepFlagged(), queryFn: () => listPrep() });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ filename: string; csv: string } | null>(null);
  const [form, setForm] = useState<null | { name: string; instrument_id: string; method_name: string; starting_vial: number; inj_per_vial: number; data_file_pattern: string; notes: string }>(null);

  const l = data?.list;
  const items = data?.items ?? [];
  const samplesMap = new Map((data?.samples ?? []).map(s => [s.id, s] as const));

  const current = form ?? (l ? {
    name: l.name, instrument_id: l.instrument_id ?? "", method_name: l.method_name ?? "",
    starting_vial: l.starting_vial, inj_per_vial: l.inj_per_vial,
    data_file_pattern: l.data_file_pattern, notes: l.notes ?? "",
  } : null);

  const saveMut = useMutation({
    mutationFn: () => update({ data: {
      id, name: current!.name, instrument_id: current!.instrument_id || null,
      method_name: current!.method_name || null, starting_vial: Number(current!.starting_vial) || 1,
      inj_per_vial: Number(current!.inj_per_vial) || 1, data_file_pattern: current!.data_file_pattern,
      notes: current!.notes || null,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.runLists.detail(id) }); toast.success("Saved"); setForm(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: (ids: string[]) => addSamples({ data: { run_list_id: id, sample_ids: ids } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: qk.runLists.detail(id) }); toast.success(`Added ${r.added}`); setPickerOpen(false); setPicked(new Set()); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rmMut = useMutation({
    mutationFn: (itemId: string) => removeItem({ data: { id: itemId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runLists.detail(id) }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadCsv(persist: boolean) {
    try {
      const r = await genCsv({ data: { run_list_id: id, persist } });
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      if (persist) { qc.invalidateQueries({ queryKey: qk.runLists.detail(id) }); toast.success("Exported"); }
    } catch (e) { toast.error((e as Error).message); }
  }

  async function showPreview() {
    try {
      const r = await genCsv({ data: { run_list_id: id, persist: false } });
      setPreview({ filename: r.filename, csv: r.csv });
    } catch (e) { toast.error((e as Error).message); }
  }

  if (isLoading || !l || !current) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const itemIds = new Set(items.map(i => i.sample_id).filter(Boolean) as string[]);
  const pickable = (prepSamples ?? []).filter(s => !itemIds.has(s.id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/run-lists"><ArrowLeft className="size-4 mr-1" />Back</Link></Button>
      </div>

      <Card className="p-5 space-y-4 border-border">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Name</Label><Input value={current.name} onChange={e => setForm({ ...current, name: e.target.value })} /></div>
          <div>
            <Label>Instrument</Label>
            <Select value={current.instrument_id} onValueChange={(v) => setForm({ ...current, instrument_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(instruments?.data ?? []).filter(i => i.is_active).map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Method (OpenLab)</Label>
            <Select value={current.method_name} onValueChange={(v) => setForm({ ...current, method_name: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(methods.data ?? []).map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Starting Vial</Label><Input type="number" min={1} value={current.starting_vial} onChange={e => setForm({ ...current, starting_vial: Number(e.target.value) })} /></div>
            <div><Label>Inj / Vial</Label><Input type="number" min={1} value={current.inj_per_vial} onChange={e => setForm({ ...current, inj_per_vial: Number(e.target.value) })} /></div>
          </div>
          <div className="sm:col-span-2"><Label>Data File Pattern</Label><Input value={current.data_file_pattern} onChange={e => setForm({ ...current, data_file_pattern: e.target.value })} /><div className="text-xs text-muted-foreground mt-1">Tokens: {"{sample} {seq} {vial} {yyyyMMdd}"}</div></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={current.notes} onChange={e => setForm({ ...current, notes: e.target.value })} /></div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
        </div>
      </Card>

      <Card className="p-5 border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Samples ({items.length})</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="size-4 mr-1" />Add prep-flagged</Button>
            <Button size="sm" variant="outline" onClick={showPreview}><FileText className="size-4 mr-1" />Preview CSV</Button>
            <Button size="sm" onClick={() => downloadCsv(true)}><Download className="size-4 mr-1" />Download &amp; Export</Button>
            {l.status === "draft" && <Button size="sm" variant="ghost" onClick={() => markSent({ data: { id } }).then(() => { qc.invalidateQueries({ queryKey: qk.runLists.detail(id) }); toast.success("Marked exported"); })}>Mark exported</Button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Sample</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Vial</th>
                <th className="text-left px-3 py-2">Sample Type</th>
                <th className="text-left px-3 py-2">Method Override</th>
                <th className="text-right px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No samples added.</td></tr>}
              {items.map(it => {
                const s = it.sample_id ? samplesMap.get(it.sample_id) : null;
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2 font-mono text-xs">{it.row_no}</td>
                    <td className="px-3 py-2 font-mono">{s?.batch_id ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s?.client ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{it.vial ?? "—"}</td>
                    <td className="px-3 py-2">{it.sample_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{it.method_override ?? <span className="italic">(list default)</span>}</td>
                    <td className="px-3 py-2 text-right"><Button size="icon" variant="ghost" onClick={() => rmMut.mutate(it.id)}><Trash2 className="size-4 text-destructive" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add prep-flagged samples</DialogTitle></DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto border border-border rounded">
            {pickable.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">No prep-flagged samples available. Flag samples from the Samples page.</div>}
            {pickable.map(s => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 border-b border-border hover:bg-muted/40 cursor-pointer">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => {
                  const n = new Set(picked); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); setPicked(n);
                }} />
                <div className="flex-1">
                  <div className="font-mono text-sm">{s.batch_id}</div>
                  <div className="text-xs text-muted-foreground">{s.client}{s.compound ? ` · ${s.compound}` : ""}{s.lot ? ` · Lot ${s.lot}` : ""}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button disabled={picked.size === 0 || addMut.isPending} onClick={() => addMut.mutate(Array.from(picked))}>Add {picked.size || ""}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{preview?.filename}</DialogTitle></DialogHeader>
          <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto max-h-[60vh]">{preview?.csv}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
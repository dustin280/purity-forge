import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { listVessels, upsertVessel, type Vessel } from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/vessels")({
  head: () => ({ meta: [
    { title: "Vessels · Sample Prep" },
    { name: "description", content: "Vessel inventory: nominal capacities, working volumes, and material types." },
    { property: "og:title", content: "Vessels" },
    { property: "og:description", content: "Vessel master data for sample preparation." },
  ]}),
  component: VesselsPage,
});

type FormState = Partial<Vessel>;

function VesselsPage() {
  const qc = useQueryClient();
  const { data: vessels = [] } = useQuery({ queryKey: ["sp-vessels"], queryFn: () => listVessels() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [form, setForm] = useState<FormState>({});

  function openNew() { setEditing(null); setForm({ graduated: true, reusable: false, is_active: true }); setOpen(true); }
  function openEdit(v: Vessel) { setEditing(v); setForm({ ...v }); setOpen(true); }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name?.trim() || !form.nominal_capacity_ul) throw new Error("Name and nominal capacity required");
      const values = {
        name: form.name!.trim(),
        nominal_capacity_ul: Number(form.nominal_capacity_ul),
        min_working_volume_ul: form.min_working_volume_ul ?? null,
        max_working_volume_ul: form.max_working_volume_ul ?? null,
        material: form.material ?? null,
        graduated: form.graduated ?? false,
        volumetric: form.volumetric ?? false,
        reusable: form.reusable ?? false,
        is_active: form.is_active ?? true,
        notes: form.notes ?? null,
      };
      await upsertVessel({ data: { id: editing?.id ?? null, values } });
    },
    onSuccess: () => {
      toast.success(editing ? "Vessel updated" : "Vessel added");
      qc.invalidateQueries({ queryKey: ["sp-vessels"] });
      qc.invalidateQueries({ queryKey: ["sp-counts"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title="Vessels" description="Vials, volumetric flasks, and tubes used across preparations. Nominal capacity drives volume validation.">
      <Card className="p-4 space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={openNew}><Plus className="size-4 mr-1" /> Add vessel</Button>
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Nominal (µL)</TableHead>
              <TableHead>Working range</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {vessels.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.nominal_capacity_ul}</TableCell>
                  <TableCell>{v.min_working_volume_ul ?? "—"} – {v.max_working_volume_ul ?? "—"} µL</TableCell>
                  <TableCell>{v.material ?? "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {v.volumetric && <Badge variant="secondary">volumetric</Badge>}
                    {v.graduated && <Badge variant="outline">graduated</Badge>}
                    {v.reusable && <Badge variant="outline">reusable</Badge>}
                    {!v.is_active && <Badge variant="destructive">inactive</Badge>}
                  </TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => openEdit(v)}><Pencil className="size-4" /></Button></TableCell>
                </TableRow>
              ))}
              {!vessels.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No vessels yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit vessel" : "New vessel"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Name *</Label><Input value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Nominal capacity (µL) *</Label><Input type="number" value={form.nominal_capacity_ul ?? ""} onChange={e => setForm({ ...form, nominal_capacity_ul: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label className="text-xs">Material</Label><Input value={form.material ?? ""} onChange={e => setForm({ ...form, material: e.target.value })} placeholder="glass, polypropylene…" /></div>
            <div className="space-y-1"><Label className="text-xs">Min working (µL)</Label><Input type="number" value={form.min_working_volume_ul ?? ""} onChange={e => setForm({ ...form, min_working_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label className="text-xs">Max working (µL)</Label><Input type="number" value={form.max_working_volume_ul ?? ""} onChange={e => setForm({ ...form, max_working_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            <div className="col-span-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!form.graduated} onChange={e => setForm({ ...form, graduated: e.target.checked })} /> Graduated</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!form.volumetric} onChange={e => setForm({ ...form, volumetric: e.target.checked })} /> Volumetric</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!form.reusable} onChange={e => setForm({ ...form, reusable: e.target.checked })} /> Reusable</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
            </div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Notes</Label><Textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SamplePrepShell>
  );
}
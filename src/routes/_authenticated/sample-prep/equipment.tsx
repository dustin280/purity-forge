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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { listEquipment, upsertEquipment, type Equipment } from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/equipment")({
  head: () => ({ meta: [
    { title: "Equipment · Sample Prep" },
    { name: "description", content: "Balances, pipettes, and volumetric equipment used in method-driven sample preparation." },
    { property: "og:title", content: "Equipment" },
    { property: "og:description", content: "Equipment master data for sample preparation." },
  ]}),
  component: EquipmentPage,
});

type FormState = Partial<Equipment>;

function EquipmentPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["sp-equipment"], queryFn: () => listEquipment() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [form, setForm] = useState<FormState>({});

  function openNew() { setEditing(null); setForm({ is_active: true, equipment_type: "balance" }); setOpen(true); }
  function openEdit(e: Equipment) { setEditing(e); setForm({ ...e }); setOpen(true); }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.equipment_type?.trim()) throw new Error("Equipment type is required");
      const values = {
        equipment_id: form.equipment_id ?? null,
        equipment_type: form.equipment_type!.trim(),
        manufacturer: form.manufacturer ?? null,
        model: form.model ?? null,
        serial_number: form.serial_number ?? null,
        min_capacity: form.min_capacity ?? null,
        max_capacity: form.max_capacity ?? null,
        capacity_unit: form.capacity_unit ?? null,
        preferred_min: form.preferred_min ?? null,
        preferred_max: form.preferred_max ?? null,
        resolution: form.resolution ?? null,
        accuracy: form.accuracy ?? null,
        uncertainty: form.uncertainty ?? null,
        calibration_status: form.calibration_status ?? null,
        calibration_date: form.calibration_date ?? null,
        calibration_due_date: form.calibration_due_date ?? null,
        location: form.location ?? null,
        is_active: form.is_active ?? true,
        notes: form.notes ?? null,
      };
      await upsertEquipment({ data: { id: editing?.id ?? null, values } });
    },
    onSuccess: () => {
      toast.success(editing ? "Equipment updated" : "Equipment added");
      qc.invalidateQueries({ queryKey: ["sp-equipment"] });
      qc.invalidateQueries({ queryKey: ["sp-counts"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title="Equipment" description="Balances and pipettes used in preparations. Capacity ranges enforce method-safe assignments; calibration status is surfaced during prep.">
      <Card className="p-4 space-y-3">
        <div className="flex justify-end"><Button size="sm" onClick={openNew}><Plus className="size-4 mr-1" /> Add equipment</Button></div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Make / model</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Calibration due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.equipment_type}</TableCell>
                  <TableCell>{[e.manufacturer, e.model].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell>{e.equipment_id ?? "—"}</TableCell>
                  <TableCell>{e.min_capacity ?? "—"} – {e.max_capacity ?? "—"} {e.capacity_unit ?? ""}</TableCell>
                  <TableCell>{e.calibration_due_date ?? "—"}</TableCell>
                  <TableCell>{e.is_active ? <Badge variant="secondary">active</Badge> : <Badge variant="outline">inactive</Badge>}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil className="size-4" /></Button></TableCell>
                </TableRow>
              ))}
              {!data.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No equipment yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit equipment" : "New equipment"}</DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? "Edit an existing equipment record" : "Add a new equipment record"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <F label="Type *"><Input value={form.equipment_type ?? ""} onChange={e => setForm({ ...form, equipment_type: e.target.value })} placeholder="balance, pipette, volumetric flask…" /></F>
            <F label="Internal ID"><Input value={form.equipment_id ?? ""} onChange={e => setForm({ ...form, equipment_id: e.target.value })} /></F>
            <F label="Manufacturer"><Input value={form.manufacturer ?? ""} onChange={e => setForm({ ...form, manufacturer: e.target.value })} /></F>
            <F label="Model"><Input value={form.model ?? ""} onChange={e => setForm({ ...form, model: e.target.value })} /></F>
            <F label="Serial number"><Input value={form.serial_number ?? ""} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></F>
            <F label="Location"><Input value={form.location ?? ""} onChange={e => setForm({ ...form, location: e.target.value })} /></F>
            <F label="Capacity unit"><Input value={form.capacity_unit ?? ""} onChange={e => setForm({ ...form, capacity_unit: e.target.value })} placeholder="mg, µL, mL" /></F>
            <F label="Resolution"><Input type="number" step="any" value={form.resolution ?? ""} onChange={e => setForm({ ...form, resolution: e.target.value === "" ? null : Number(e.target.value) })} /></F>
            <F label="Min capacity"><Input type="number" step="any" value={form.min_capacity ?? ""} onChange={e => setForm({ ...form, min_capacity: e.target.value === "" ? null : Number(e.target.value) })} /></F>
            <F label="Max capacity"><Input type="number" step="any" value={form.max_capacity ?? ""} onChange={e => setForm({ ...form, max_capacity: e.target.value === "" ? null : Number(e.target.value) })} /></F>
            <F label="Preferred min"><Input type="number" step="any" value={form.preferred_min ?? ""} onChange={e => setForm({ ...form, preferred_min: e.target.value === "" ? null : Number(e.target.value) })} /></F>
            <F label="Preferred max"><Input type="number" step="any" value={form.preferred_max ?? ""} onChange={e => setForm({ ...form, preferred_max: e.target.value === "" ? null : Number(e.target.value) })} /></F>
            <F label="Accuracy"><Input value={form.accuracy ?? ""} onChange={e => setForm({ ...form, accuracy: e.target.value })} /></F>
            <F label="Uncertainty"><Input value={form.uncertainty ?? ""} onChange={e => setForm({ ...form, uncertainty: e.target.value })} /></F>
            <F label="Calibration status"><Input value={form.calibration_status ?? ""} onChange={e => setForm({ ...form, calibration_status: e.target.value })} placeholder="current, expired…" /></F>
            <div />
            <F label="Calibration date"><Input type="date" value={form.calibration_date ?? ""} onChange={e => setForm({ ...form, calibration_date: e.target.value })} /></F>
            <F label="Calibration due"><Input type="date" value={form.calibration_due_date ?? ""} onChange={e => setForm({ ...form, calibration_due_date: e.target.value })} /></F>
            <div className="col-span-2 flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active
            </div>
            <div className="col-span-2"><F label="Notes"><Textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></F></div>
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
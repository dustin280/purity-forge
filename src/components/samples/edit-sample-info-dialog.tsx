/**
 * Corrects the descriptive fields of a sample that has already been received.
 *
 * These are all enterable at intake, and a mistake made there used to be
 * unfixable from the UI -- the wrong client picked on a vial stayed wrong.
 *
 * Client defaults to applying across the whole receipt, because it is a fact
 * about the shipment rather than about one vial: correcting a single vial is
 * how one receipt ends up carrying three spellings of the same company.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientSelect } from "@/components/samples/client-select";
import { updateSampleInfo } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";

export function EditSampleInfoDialog({
  open, onOpenChange, sample, batchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sample: {
    id: string;
    client: string;
    client_id?: string | null;
    project: string | null;
    lot?: string | null;
    notes: string | null;
  };
  batchId: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(updateSampleInfo);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [project, setProject] = useState("");
  const [lot, setLot] = useState("");
  const [notes, setNotes] = useState("");
  const [wholeReceipt, setWholeReceipt] = useState(true);

  useEffect(() => {
    if (!open) return;
    setClientId(sample.client_id ?? "");
    setClientName(sample.client ?? "");
    setProject(sample.project ?? "");
    setLot(sample.lot ?? "");
    setNotes(sample.notes ?? "");
    setWholeReceipt(true);
  }, [open, sample]);

  const clientChanged = (sample.client_id ?? "") !== clientId && clientId !== "";

  const mut = useMutation({
    mutationFn: () => save({ data: {
      sampleId: sample.id,
      scope: wholeReceipt ? "receipt" : "vial",
      client_id: clientId || null,
      project: project.trim() || null,
      // The partner's own per-vial lot string -- never spread across the
      // receipt, and the server enforces that too.
      lot: lot.trim() || null,
      notes: notes.trim() || null,
    } }),
    onSuccess: (r) => {
      const n = (r as { updated?: number })?.updated ?? 1;
      toast.success(n > 1 ? `Updated ${n} vials on this receipt` : "Sample updated");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
      qc.invalidateQueries({ queryKey: qk.samples.list() });
      qc.invalidateQueries({ queryKey: qk.cocRecords.list() });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update sample"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit sample details — {batchId}</DialogTitle>
          <DialogDescription>
            Corrects information captured at receipt. Results, status and IDs are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <ClientSelect
            clientId={clientId}
            clientName={clientName}
            onSelect={(id, name) => { setClientId(id); setClientName(name); }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Project</Label>
              <Input className="mt-1" value={project} onChange={(e) => setProject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Lot (client / partner)</Label>
              <Input className="mt-1 font-mono text-xs" value={lot} onChange={(e) => setLot(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">
                This vial only — it's the partner's lookup key.
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={wholeReceipt}
              onChange={(e) => setWholeReceipt(e.target.checked)}
            />
            <span className="text-xs">
              <span className="font-medium">Apply client, project and notes to every vial on this receipt</span>
              <span className="block text-muted-foreground mt-0.5">
                {clientChanged
                  ? "Recommended — the client is the same for the whole shipment, so leaving the other vials behind would split one receipt across two client names."
                  : "Keeps the whole receipt consistent. Untick to change this vial alone."}
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

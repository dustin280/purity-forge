import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { listInstrumentOccupants, releaseInstrumentPositions } from "@/lib/run-lists/generate.functions";
import { qk } from "@/lib/query-keys";

export function NoVialsDialog({
  open,
  onOpenChange,
  onReleased,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReleased: () => void;
}) {
  const list = useServerFn(listInstrumentOccupants);
  const release = useServerFn(releaseInstrumentPositions);
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { data: occupants = [], isLoading } = useQuery({
    queryKey: qk.runLists.instrumentOccupants(),
    queryFn: () => list(),
    enabled: open,
  });

  const releaseMut = useMutation({
    mutationFn: (sampleIds: string[]) => release({ data: { sample_ids: sampleIds } }),
    onSuccess: (r) => {
      toast.success(`Removed ${r.released} sample${r.released === 1 ? "" : "s"} from the instrument`);
      qc.invalidateQueries({ queryKey: qk.runLists.instrumentOccupants() });
      setChecked(new Set());
      onOpenChange(false);
      onReleased();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (sampleId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId); else next.add(sampleId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>No open vial positions</DialogTitle>
          <DialogDescription>
            The instrument's tray is full, so some samples in this proposal couldn't be assigned a
            vial. If a run is physically finished but hasn't been marked Complete yet (review still
            pending), you can remove it from the instrument here to free its position — the sample
            itself stays on record, this just clears the physical slot. Oldest first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : occupants.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground text-center">
            No samples are currently occupying an instrument position.
          </div>
        ) : (
          <div className="border rounded-md divide-y divide-border">
            {occupants.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked.has(o.sample_id)}
                  onCheckedChange={() => toggle(o.sample_id)}
                />
                <span className="font-mono text-xs">{o.sample?.batch_id ?? o.sample_id}</span>
                <span className="text-muted-foreground text-xs flex-1 truncate">
                  {o.sample?.client}{o.sample?.compound ? ` · ${o.sample.compound}` : ""}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{o.location}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(o.assigned_at).toLocaleDateString()}
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={checked.size === 0 || releaseMut.isPending}
            onClick={() => releaseMut.mutate([...checked])}
          >
            Remove {checked.size > 0 ? `${checked.size} ` : ""}from instrument
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

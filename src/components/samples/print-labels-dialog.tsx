import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export type LabelSample = { batch_id: string; compound?: string | null; lot?: string | null };

/**
 * Sends the selected samples to the vial-label sheet tool, repeating each
 * label `duplicates` times so an analyst can label associated glassware.
 */
export function PrintLabelsDialog({
  open, onOpenChange, samples,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  samples: LabelSample[];
}) {
  const navigate = useNavigate();
  const [duplicates, setDuplicates] = useState(1);
  const [includeLot, setIncludeLot] = useState(true);

  const lines = samples.flatMap((s) => {
    const lot = includeLot && s.lot ? ` / Lot ${s.lot}` : "";
    const text = `${s.batch_id}${lot}`;
    return Array.from({ length: Math.max(1, duplicates) }, () => text);
  });

  function go() {
    if (lines.length === 0) { toast.error("Select at least one sample."); return; }
    try {
      sessionStorage.setItem("vial-labels-pending", lines.join("\n"));
      sessionStorage.setItem("vial-labels-return-to", `${window.location.pathname}${window.location.search}`);
    } catch { /* ignore */ }
    onOpenChange(false);
    void navigate({ to: "/vial-labels" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Print Labels</DialogTitle>
          <DialogDescription>
            {samples.length} sample{samples.length === 1 ? "" : "s"} selected. Labels open in the
            vial label sheet where you can pick the starting cell and print.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dupes">Duplicates per sample</Label>
            <Input
              id="dupes"
              type="number"
              min={1}
              max={50}
              value={duplicates}
              onChange={(e) => setDuplicates(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              {lines.length} label{lines.length === 1 ? "" : "s"} total.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeLot}
              onChange={(e) => setIncludeLot(e.target.checked)}
              className="size-4 accent-primary"
            />
            Include lot number on the label
          </label>

          {lines.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 max-h-40 overflow-auto font-mono text-xs space-y-0.5">
              {lines.slice(0, 20).map((l, i) => <div key={i}>{l}</div>)}
              {lines.length > 20 && <div className="text-muted-foreground">…and {lines.length - 20} more</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go}>Open Label Sheet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

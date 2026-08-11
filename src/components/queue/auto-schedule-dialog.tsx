import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { autoSchedulePending } from "@/lib/queue.functions";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";

type Change = {
  sample_id: string; from: string | null; to: string;
  batch_id: string | null; client: string | null; compound: string | null;
};

export function AutoScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const signalWorkflowEvent = useWorkflowSignal();
  const runFn = useServerFn(autoSchedulePending);
  const [preview, setPreview] = useState<{ changes: Change[]; unassignable: string[] } | null>(null);

  const previewMut = useMutation({
    mutationFn: async () => runFn({ data: { dry_run: true } }) as Promise<{ changes: Change[]; unassignable: string[] }>,
    onSuccess: (r) => setPreview({ changes: r.changes, unassignable: r.unassignable }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to preview"),
  });

  const applyMut = useMutation({
    mutationFn: async () => runFn({ data: { dry_run: false } }) as Promise<{ applied: number }>,
    onSuccess: (r) => {
      toast.success(`Applied ${r.applied} assignment${r.applied === 1 ? "" : "s"}`);
      signalWorkflowEvent("auto-scheduled");
      qc.invalidateQueries({ queryKey: qk.queue.all });
      qc.invalidateQueries({ queryKey: qk.samples.all });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to apply"),
  });

  useEffect(() => {
    if (open) { setPreview(null); previewMut.mutate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auto-Schedule Preview</DialogTitle>
          <DialogDescription className="sr-only">
            Preview automatic scheduling of pending samples
          </DialogDescription>
        </DialogHeader>
        {previewMut.isPending && <div className="text-sm text-muted-foreground">Running simulation…</div>}
        {preview && (
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-semibold">{preview.changes.length}</span> assignment change{preview.changes.length === 1 ? "" : "s"}.
              {preview.unassignable.length > 0 && (
                <span className="text-rose-400 ml-2">{preview.unassignable.length} cannot meet TAT.</span>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto rounded border divide-y">
              {preview.changes.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No changes needed. Everything already scheduled optimally.</div>
              ) : preview.changes.map((c) => (
                <div key={c.sample_id} className="p-2 text-xs flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium">{c.batch_id ?? c.sample_id.slice(0, 8)}</span>
                    {c.compound && <span className="text-muted-foreground"> — {c.compound}</span>}
                  </span>
                  <span className="text-muted-foreground shrink-0">{c.from ?? "—"} → <span className="text-foreground">{c.to}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => applyMut.mutate()} disabled={!preview || preview.changes.length === 0 || applyMut.isPending}>
            {applyMut.isPending ? "Applying…" : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
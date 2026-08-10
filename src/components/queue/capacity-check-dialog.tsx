import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkNewSampleCapacity } from "@/lib/queue.functions";
import { useState } from "react";

type PerDay = { date: string; capacity: number; booked: number; available: number };

export function CapacityCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const checkFn = useServerFn(checkNewSampleCapacity);

  const runMut = useMutation({
    mutationFn: async () =>
      checkFn({ data: { receipt_date: date, count } }) as Promise<{
        can_accept: boolean;
        suggested_date: string | null;
        lead_time_days: number | null;
        per_day: PerDay[];
      }>,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) runMut.reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Check New Sample Capacity</DialogTitle>
          <DialogDescription className="sr-only">
            Check whether the queue has capacity for new samples
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cap-date">Receipt date</Label>
            <Input id="cap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cap-count"># of samples</Label>
            <Input id="cap-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
          </div>
        </div>
        {runMut.data && (
          <div className="rounded border p-3 text-sm space-y-2">
            <div>
              {runMut.data.can_accept ? (
                <span className="text-emerald-400 font-medium">Queue can accept.</span>
              ) : (
                <span className="text-rose-400 font-medium">Queue is full — cannot meet TAT.</span>
              )}
              {runMut.data.suggested_date && (
                <span className="text-muted-foreground ml-2">
                  Suggested date: <span className="text-foreground">{runMut.data.suggested_date}</span>
                  {typeof runMut.data.lead_time_days === "number" && ` (in ${runMut.data.lead_time_days} day${runMut.data.lead_time_days === 1 ? "" : "s"})`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1 text-[10px]">
              {runMut.data.per_day.slice(0, 10).map((d) => (
                <div key={d.date} className="p-1 border rounded text-center">
                  <div className="text-muted-foreground">{d.date.slice(5)}</div>
                  <div className="font-mono">{d.booked}/{d.capacity}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            {runMut.isPending ? "Checking…" : "Check"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
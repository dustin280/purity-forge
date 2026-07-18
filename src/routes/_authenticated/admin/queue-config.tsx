import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getQueueConfig, updateQueueConfig } from "@/lib/queue.functions";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/queue-config")({
  component: QueueConfigPage,
});

function QueueConfigPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getQueueConfig);
  const setFn = useServerFn(updateQueueConfig);
  const { data } = useQuery({
    queryKey: qk.queue.config(),
    queryFn: () => getFn(),
  });

  const [dailyCapacity, setDailyCapacity] = useState(20);
  const [tatDays, setTatDays] = useState(5);
  const [businessOnly, setBusinessOnly] = useState(false);
  const [threshold, setThreshold] = useState(80);

  useEffect(() => {
    if (data) {
      setDailyCapacity(data.daily_capacity);
      setTatDays(data.tat_days);
      setBusinessOnly(data.business_days_only);
      setThreshold(data.approaching_threshold_pct);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          daily_capacity: dailyCapacity,
          tat_days: tatDays,
          business_days_only: businessOnly,
          approaching_threshold_pct: threshold,
        },
      }),
    onSuccess: () => {
      toast.success("Queue configuration saved");
      qc.invalidateQueries({ queryKey: qk.queue.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Analysis Queue Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Applies to the queue simulator and the intake capacity gate.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <Label htmlFor="cap">Daily analysis capacity</Label>
          <Input id="cap" type="number" min={1} max={1000} value={dailyCapacity} onChange={(e) => setDailyCapacity(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs text-muted-foreground mt-1">Maximum samples the lab can analyze per day.</p>
        </div>
        <div>
          <Label htmlFor="tat">Turnaround days</Label>
          <Input id="tat" type="number" min={1} max={60} value={tatDays} onChange={(e) => setTatDays(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs text-muted-foreground mt-1">Due date = receipt date + this many days.</p>
        </div>
        <div>
          <Label htmlFor="pct">Approaching threshold (%)</Label>
          <Input id="pct" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
          <p className="text-xs text-muted-foreground mt-1">Queue turns amber once this % of any day in the 5-day window is booked.</p>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Business days only</div>
            <div className="text-xs text-muted-foreground">Exclude weekends from scheduling.</div>
          </div>
          <Switch checked={businessOnly} onCheckedChange={setBusinessOnly} />
        </div>
        <div className="pt-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save configuration"}
          </Button>
        </div>
      </div>
    </div>
  );
}
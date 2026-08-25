import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getQueueOverview, listQueueWorkSamples, type QueueWorkListRow } from "@/lib/queue.functions";
import { bulkSetSampleQueueStatus } from "@/lib/queue.functions";
import { bulkSetSamplePrepFlag } from "@/lib/run-lists.functions";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tags, FlaskConical, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { qk } from "@/lib/query-keys";
import { StatusBanner } from "@/components/queue/status-banner";
import { CapacityOverview } from "@/components/queue/capacity-overview";
import { QueueWorkTable, type QueueSortKey, type SortDir } from "@/components/queue/queue-work-table";
import { AtRiskPanel } from "@/components/queue/at-risk-panel";
import { QuickActions } from "@/components/queue/quick-actions";
import { AutoScheduleDialog } from "@/components/queue/auto-schedule-dialog";
import { CapacityCheckDialog } from "@/components/queue/capacity-check-dialog";
import { PrintLabelsDialog } from "@/components/samples/print-labels-dialog";
import { CANONICAL_STATUS_FOR_DISPLAY, DISPLAY_STATUS_LABEL, type DisplayStatus, type SampleStatus } from "@/lib/lims-utils";

export const Route = createFileRoute("/_authenticated/queue/")({
  component: QueuePage,
});

type Overview = Awaited<ReturnType<typeof getQueueOverview>>;

const FLAG_STATUSES = Object.keys(DISPLAY_STATUS_LABEL) as DisplayStatus[];
type FlagStatus = DisplayStatus;

function compareWorkRows(a: QueueWorkListRow, b: QueueWorkListRow, key: QueueSortKey): number {
  const av = key === "compound" ? a.compound ?? "" : (a as unknown as Record<string, string>)[key] ?? "";
  const bv = key === "compound" ? b.compound ?? "" : (b as unknown as Record<string, string>)[key] ?? "";
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

function QueuePage() {
  const overviewFn = useServerFn(getQueueOverview);
  const workFn = useServerFn(listQueueWorkSamples);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flagStatus, setFlagStatus] = useState<FlagStatus>("on_hold");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<QueueSortKey>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");

  const bulkFn = useServerFn(bulkSetSampleQueueStatus);
  const bulkFlag = useMutation({
    mutationFn: (v: { sample_ids: string[]; status: SampleStatus }) => bulkFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(`Flagged ${v.sample_ids.length} sample${v.sample_ids.length === 1 ? "" : "s"} as ${v.status.replace("_", " ")}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: qk.queue.all });
      qc.invalidateQueries({ queryKey: qk.samples.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prepFlagFn = useServerFn(bulkSetSamplePrepFlag);
  const sendToPrep = useMutation({
    mutationFn: (v: { sample_ids: string[] }) => prepFlagFn({ data: { sample_ids: v.sample_ids, flag: true } }),
    onSuccess: (_r, v) => {
      toast.success(`Checked out ${v.sample_ids.length} sample${v.sample_ids.length === 1 ? "" : "s"} for prep`);
      try {
        sessionStorage.setItem("prep-queue-pending", JSON.stringify(v.sample_ids));
      } catch { /* ignore */ }
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: qk.queue.all });
      qc.invalidateQueries({ queryKey: qk.samples.all });
      void navigate({ to: "/sample-prep/queue" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });

  const toggleAllWork = (checked: boolean) =>
    setSelected(checked ? new Set(sortedWork.map((s) => s.id)) : new Set());

  function handleSort(key: QueueSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const { data, isLoading } = useQuery({
    queryKey: qk.queue.overview(),
    queryFn: () => overviewFn() as Promise<Overview>,
    refetchInterval: 60_000,
  });

  const { data: workRows, isLoading: workLoading } = useQuery({
    queryKey: qk.queue.work(),
    queryFn: () => workFn(),
    refetchInterval: 60_000,
  });

  const sortedWork = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (workRows ?? []).filter((s) => {
      if (!q) return true;
      return `${s.batch_id} ${s.client} ${s.project ?? ""} ${s.compound ?? ""} ${s.lot ?? ""}`.toLowerCase().includes(q);
    });
    rows.sort((a, b) => compareWorkRows(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return rows;
  }, [workRows, sortKey, sortDir, search]);

  useEffect(() => {
    const channel = supabase
      .channel("queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "samples" }, () => {
        qc.invalidateQueries({ queryKey: qk.queue.all });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_config" }, () => {
        qc.invalidateQueries({ queryKey: qk.queue.all });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  useEffect(() => {
    if (!activeDate && data?.today) setActiveDate(data.today);
  }, [activeDate, data?.today]);

  const openSample = (batchId: string) => navigate({ to: "/samples/$batchId", params: { batchId } });

  const selectedSamples = sortedWork.filter((s) => selected.has(s.id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Operations</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Analysis Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Every open sample, sortable and selectable. Due dates below are informational — nothing here blocks you from picking up any sample, including completed ones for a rerun.</p>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="rounded-xl border bg-card p-10 text-sm text-muted-foreground">Loading queue…</div>
      ) : (
        <div className="space-y-4">
          <StatusBanner
            health={data.health}
            slots={data.slots_today}
            nextAcceptDate={data.next_accept_date}
            leadTimeDays={data.lead_time_days}
            atRiskCount={data.at_risk_count}
          />

          <CapacityOverview
            days={data.per_day}
            activeDate={activeDate}
            onSelect={setActiveDate}
          />

          <QuickActions
            onAutoSchedule={() => setAutoOpen(true)}
            onCheckCapacity={() => setCheckOpen(true)}
            isPending={false}
          />

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                disabled={sendToPrep.isPending}
                onClick={() => sendToPrep.mutate({ sample_ids: [...selected] })}
              >
                <FlaskConical className="size-4 mr-1" />
                {sendToPrep.isPending ? "Checking out…" : "Send to Prep"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLabelsOpen(true)}>
                <Tags className="size-4 mr-1" />Print Labels
              </Button>
              <Select value={flagStatus} onValueChange={(v) => setFlagStatus(v as FlagStatus)}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="New state" />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{DISPLAY_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkFlag.isPending}
                onClick={() => bulkFlag.mutate({ sample_ids: [...selected], status: CANONICAL_STATUS_FOR_DISPLAY[flagStatus] })}
              >
                {bulkFlag.isPending ? "Flagging…" : "Flag selected"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          <div className="relative max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search Sample ID, client, compound, lot…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <QueueWorkTable
            rows={sortedWork}
            isLoading={workLoading}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            selectedIds={selected}
            onToggleSelect={toggleOne}
            onToggleAll={toggleAllWork}
            today={data.today}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AtRiskPanel samples={data.at_risk} onOpen={openSample} />
            {data.backlog.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm font-semibold mb-2">Backlog / Unscheduled</div>
                <div className="space-y-1 text-xs">
                  {data.backlog.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSample(s.batch_id)}
                      className="w-full text-left text-muted-foreground hover:text-foreground truncate"
                    >
                      {s.batch_id} — {s.client} — due {s.due_date}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground py-2">
            FIFO by earliest due date · Daily capacity: {data.config.daily_capacity} samples ·{" "}
            <a href="/admin/queue-config" className="underline">configurable</a>
          </div>
        </div>
      )}

      <AutoScheduleDialog open={autoOpen} onOpenChange={setAutoOpen} />
      <CapacityCheckDialog open={checkOpen} onOpenChange={setCheckOpen} />
      <PrintLabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} samples={selectedSamples} />
    </div>
  );
}
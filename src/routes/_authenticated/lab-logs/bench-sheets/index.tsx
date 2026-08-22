import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listRunLists } from "@/lib/run-lists.functions";
import { listBenchSheetStatuses } from "@/lib/run-lists/bench-sheet.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/bench-sheets/")({
  component: BenchSheetsLog,
});

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started", in_progress: "In Progress", completed: "Completed", reviewed: "Reviewed",
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reviewed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function BenchSheetsLog() {
  const listFn = useServerFn(listRunLists);
  const statusFn = useServerFn(listBenchSheetStatuses);
  const { data: runLists, isLoading } = useQuery({ queryKey: qk.runLists.list(), queryFn: () => listFn() });
  const { data: statuses } = useQuery({ queryKey: qk.benchSheets.list(), queryFn: () => statusFn() });
  const statusByRunList = new Map((statuses ?? []).map((s) => [s.run_list_id, s]));

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const rows = (runLists ?? []).map((l) => ({
    list: l,
    status: statusByRunList.get(l.id)?.status ?? "not_started",
  }));
  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <Link to="/lab-logs" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Logs
      </Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Bench Sheets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record of Analysis for each run list. Click into a run list's bench sheet to record or review it.
        </p>
      </div>

      <Card className="p-4 flex items-end gap-3">
        <div className="w-44">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Object.keys(STATUS_LABEL).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Run List</th>
              <th className="text-left px-3 py-2">Instrument</th>
              <th className="text-left px-3 py-2">Method</th>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No run lists match.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.list.id} className="hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link to="/run-lists/$id/bench-sheet" params={{ id: r.list.id }} className="font-medium hover:underline">
                    {r.list.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.list.instrument_id ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.list.method_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(r.list.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLOR[r.status]} variant="secondary">{STATUS_LABEL[r.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listAnalysisBatches } from "@/lib/lims/analysis-batches.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/analysis-batches/")({
  component: AnalysisBatchesLog,
});

const STATUS_LABEL: Record<string, string> = { in_progress: "In Progress", completed: "Completed", reviewed: "Reviewed" };
const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reviewed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function AnalysisBatchesLog() {
  const listFn = useServerFn(listAnalysisBatches);
  const { data: batches, isLoading } = useQuery({ queryKey: qk.analysisBatches.list(), queryFn: () => listFn({ data: {} }) });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filtered = (batches ?? []).filter((b) => statusFilter === "all" || b.status === statusFilter);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <Link to="/lab-logs" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Logs
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Analysis Batches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record of Analysis for non-HPLC testing — who ran it, media/lots, incubator(s), and sign-off.
          </p>
        </div>
        <Button asChild size="sm"><Link to="/lab-logs/analysis-batches/new"><Plus className="size-4 mr-1" />New Batch</Link></Button>
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
              <th className="text-left px-3 py-2">Batch #</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Analyst</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No batches yet.</td></tr>
            ) : filtered.map((b) => (
              <tr key={b.id} className="hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link to="/lab-logs/analysis-batches/$id" params={{ id: b.id }} className="font-mono font-medium hover:underline">{b.batch_number}</Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{b.test_type}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{b.performed_by ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(b.performed_at).toLocaleDateString()}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLOR[b.status]} variant="secondary">{STATUS_LABEL[b.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

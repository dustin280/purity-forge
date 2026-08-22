import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  getAnalysisBatch, recordItemCheck, completeAnalysisBatch, reviewAnalysisBatch,
  type AnalysisBatchRow,
} from "@/lib/lims/analysis-batches.functions";
import { exportAnalysisBatchPdf } from "@/lib/analysis-batch-pdf";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/analysis-batches/$id")({
  component: AnalysisBatchDetail,
});

const STATUS_LABEL: Record<string, string> = { in_progress: "In Progress", completed: "Completed", reviewed: "Reviewed" };
const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reviewed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

type SterilityDetails = {
  ftm_lot_number: string | null;
  tsb_lot_number: string | null;
  inoculation_volume_ml: number;
  incubators: Array<{ unit_id: string; unit_name: string; temperature_c: number | null }>;
};

function AnalysisBatchDetail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getAnalysisBatch);
  const completeFn = useServerFn(completeAnalysisBatch);
  const reviewFn = useServerFn(reviewAnalysisBatch);

  const { data, isLoading } = useQuery({ queryKey: qk.analysisBatches.detail(id), queryFn: () => getFn({ data: { batchId: id } }) });

  function invalidate() { qc.invalidateQueries({ queryKey: qk.analysisBatches.detail(id) }); }

  const completeMut = useMutation({
    mutationFn: () => completeFn({ data: { batchId: id } }),
    onSuccess: () => { toast.success("Batch completed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [reviewComment, setReviewComment] = useState("");
  const reviewMut = useMutation({
    mutationFn: () => reviewFn({ data: { batchId: id, comment: reviewComment.trim() || null } }),
    onSuccess: () => { toast.success("Batch reviewed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const { batch, rows, profiles, readoutDueDate, readoutDue } = data;
  const details = batch.details as unknown as SterilityDetails;
  const nameFor = (uid: string | null) => {
    if (!uid) return null;
    const p = profiles.find((p) => p.id === uid);
    return p ? profileDisplayName(p, uid) : uid;
  };
  const canReview = role === "reviewer" || role === "admin";
  const allChecked = rows.every((r) => r.day3Status !== "pending") && rows.every((r) => r.day7Status !== "pending");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/lab-logs/analysis-batches" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="size-3" /> Analysis Batches
        </Link>
        <Button
          size="sm" variant="outline"
          onClick={() => exportAnalysisBatchPdf(batch, rows, details, { performedBy: nameFor(batch.performed_by), reviewedBy: nameFor(batch.reviewed_by) })}
        >
          <Download className="size-4 mr-1" />Export PDF
        </Button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Record of Analysis</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 font-mono">{batch.batch_number}</h1>
        <p className="text-sm text-muted-foreground mt-1">{batch.test_type} · {batch.method ?? "—"}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge className={STATUS_COLOR[batch.status]} variant="secondary">{STATUS_LABEL[batch.status]}</Badge>
          {readoutDueDate && (
            <span className={`text-xs ${readoutDue ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"}`}>
              {readoutDue ? "Ready for readout" : "Readout due"} {new Date(readoutDueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <Card className="p-5 border-border text-sm space-y-2">
        <div className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
          <div>Analyst: <span className="text-foreground">{nameFor(batch.performed_by) ?? "—"}</span></div>
          <div>Date/time: <span className="text-foreground">{new Date(batch.performed_at).toLocaleString()}</span></div>
          <div>FTM lot: <span className="text-foreground font-mono">{details.ftm_lot_number ?? "—"}</span></div>
          <div>TSB lot: <span className="text-foreground font-mono">{details.tsb_lot_number ?? "—"}</span></div>
          <div>Inoculation volume: <span className="text-foreground">{details.inoculation_volume_ml}mL each</span></div>
          <div>Placed in incubator: <span className="text-foreground">{batch.incubation_started_at ? new Date(batch.incubation_started_at).toLocaleString() : "—"}</span></div>
        </div>
        <div>
          Incubator(s): {(details.incubators ?? []).map((i) => (
            <span key={i.unit_id} className="inline-block mr-3 text-foreground">
              {i.unit_name}{i.temperature_c != null ? ` (${i.temperature_c}°C)` : ""}
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden overflow-x-auto border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Sample</th>
              <th className="text-left px-3 py-2">Compound</th>
              <th className="text-left px-3 py-2">Tray</th>
              <th className="text-left px-3 py-2">Day 3</th>
              <th className="text-left px-3 py-2">Day 7</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.itemId}>
                <td className="px-3 py-2 font-mono">{r.batchId ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.compound ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.slotLabel ?? "—"}</td>
                <td className="px-3 py-2"><CheckCell row={r} checkpoint="day3" onChanged={invalidate} readOnly={batch.status === "reviewed"} /></td>
                <td className="px-3 py-2"><CheckCell row={r} checkpoint="day7" onChanged={invalidate} readOnly={batch.status === "reviewed"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {batch.status === "in_progress" && (
        <div className="flex items-center gap-3">
          <Button disabled={completeMut.isPending} onClick={() => completeMut.mutate()}>
            {completeMut.isPending ? "Completing…" : "Complete Batch"}
          </Button>
          {!allChecked && <span className="text-xs text-muted-foreground">Day 3/7 checks can still be recorded after completing.</span>}
        </div>
      )}

      {batch.status === "completed" && canReview && (
        <Card className="p-5 border-border space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Review &amp; Sign</h3>
          <Textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Review comment (optional)" />
          <Button disabled={reviewMut.isPending} onClick={() => reviewMut.mutate()}>
            {reviewMut.isPending ? "Signing…" : "Review & Sign"}
          </Button>
        </Card>
      )}
      {batch.status === "reviewed" && (
        <Card className="p-5 border-border text-sm text-muted-foreground">
          Reviewed by {nameFor(batch.reviewed_by)} on {batch.reviewed_at ? new Date(batch.reviewed_at).toLocaleString() : "—"}
          {batch.review_comment ? ` — ${batch.review_comment}` : ""}
        </Card>
      )}
    </div>
  );
}

function CheckCell({ row, checkpoint, onChanged, readOnly }: {
  row: AnalysisBatchRow; checkpoint: "day3" | "day7"; onChanged: () => void; readOnly: boolean;
}) {
  const checkFn = useServerFn(recordItemCheck);
  const status = checkpoint === "day3" ? row.day3Status : row.day7Status;
  const due = checkpoint === "day3" ? row.day3Due : row.day7Due;
  const checkedAt = checkpoint === "day3" ? row.day3CheckedAt : row.day7CheckedAt;

  const mut = useMutation({
    mutationFn: (result: "clear" | "turbid") => checkFn({ data: { itemId: row.itemId, checkpoint, result } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (status !== "pending") {
    return (
      <span className="text-xs">
        <span className={`font-semibold uppercase ${status === "turbid" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
          {status}
        </span>
        {checkedAt && <span className="text-muted-foreground"> · {new Date(checkedAt).toLocaleDateString()}</span>}
      </span>
    );
  }
  if (readOnly) return <span className="text-xs text-muted-foreground">—</span>;
  if (!due) return <span className="text-xs text-muted-foreground">Not due</span>;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={mut.isPending} onClick={() => mut.mutate("clear")}>Clear</Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={mut.isPending} onClick={() => mut.mutate("turbid")}>Turbid</Button>
    </div>
  );
}

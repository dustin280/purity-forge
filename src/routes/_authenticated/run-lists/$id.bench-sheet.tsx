import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  getBenchSheet, startBenchSheet, updateBenchSheetNarrative, updateRunListItemComment,
  completeBenchSheet, reviewBenchSheet,
} from "@/lib/run-lists/bench-sheet.functions";
import { exportBenchSheetPdf } from "@/lib/run-list-bench-sheet-pdf";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/run-lists/$id/bench-sheet")({
  component: BenchSheetPage,
});

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In Progress", completed: "Completed", reviewed: "Reviewed",
};
const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reviewed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function BenchSheetPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getBenchSheet);
  const startFn = useServerFn(startBenchSheet);
  const updNarrativeFn = useServerFn(updateBenchSheetNarrative);
  const updCommentFn = useServerFn(updateRunListItemComment);
  const completeFn = useServerFn(completeBenchSheet);
  const reviewFn = useServerFn(reviewBenchSheet);

  const { data, isLoading } = useQuery({
    queryKey: qk.benchSheets.detail(id),
    queryFn: () => getFn({ data: { runListId: id } }),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: qk.benchSheets.detail(id) });
  }

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { runListId: id } }),
    onSuccess: () => { toast.success("Bench sheet started"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [narrative, setNarrative] = useState<string | null>(null);
  const [deviationFlag, setDeviationFlag] = useState<boolean | null>(null);
  const [deviationNotes, setDeviationNotes] = useState<string | null>(null);
  const narrativeMut = useMutation({
    mutationFn: (patch: { narrative?: string; deviationFlag?: boolean; deviationNotes?: string }) =>
      updNarrativeFn({ data: { runListId: id, ...patch } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const commentMut = useMutation({
    mutationFn: (v: { itemId: string; comment: string }) => updCommentFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMut = useMutation({
    mutationFn: () => completeFn({ data: { runListId: id } }),
    onSuccess: () => { toast.success("Bench sheet completed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [reviewComment, setReviewComment] = useState("");
  const reviewMut = useMutation({
    mutationFn: () => reviewFn({ data: { runListId: id, comment: reviewComment.trim() || null } }),
    onSuccess: () => { toast.success("Bench sheet reviewed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const { list, sheet, rows, profiles } = data;
  const nameFor = (uid: string | null) => {
    if (!uid) return null;
    const p = profiles.find((p) => p.id === uid);
    return p ? profileDisplayName(p, uid) : uid;
  };
  const canReview = role === "reviewer" || role === "admin";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/run-lists/$id" params={{ id }}><ArrowLeft className="size-4 mr-1" />Back to Run List</Link></Button>
        {sheet && (
          <Button
            size="sm" variant="outline"
            onClick={() => exportBenchSheetPdf(list, sheet, rows, { performedBy: nameFor(sheet.performed_by), reviewedBy: nameFor(sheet.reviewed_by) })}
          >
            <Download className="size-4 mr-1" />Export PDF
          </Button>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Record of Analysis</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{list.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {list.instrument_id ? `Instrument: ${list.instrument_id} · ` : ""}{list.method_name ? `Method: ${list.method_name}` : ""}
        </p>
        {sheet && <Badge className={`mt-2 ${STATUS_COLOR[sheet.status]}`} variant="secondary">{STATUS_LABEL[sheet.status]}</Badge>}
      </div>

      {!sheet ? (
        <Card className="p-5 border-border">
          <p className="text-sm text-muted-foreground mb-3">No bench sheet started for this run yet.</p>
          <Button disabled={startMut.isPending} onClick={() => startMut.mutate()}>
            {startMut.isPending ? "Starting…" : "Start Bench Sheet"}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-5 border-border text-sm">
            <div className="grid sm:grid-cols-2 gap-2 text-muted-foreground">
              <div>Performed by: <span className="text-foreground">{nameFor(sheet.performed_by) ?? "—"}</span></div>
              <div>Started: <span className="text-foreground">{sheet.run_started_at ? new Date(sheet.run_started_at).toLocaleString() : "—"}</span></div>
              <div>Completed: <span className="text-foreground">{sheet.run_completed_at ? new Date(sheet.run_completed_at).toLocaleString() : "—"}</span></div>
              <div>Reviewed by: <span className="text-foreground">{nameFor(sheet.reviewed_by) ?? "—"}</span></div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden overflow-x-auto border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Sample</th>
                  <th className="text-left px-3 py-2">Vial</th>
                  <th className="text-left px-3 py-2">Prep</th>
                  <th className="text-left px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.itemId}>
                    <td className="px-3 py-2 font-mono text-xs">{r.rowNo}</td>
                    <td className="px-3 py-2 font-mono">{r.batchId ?? r.sampleType}{r.compound ? <span className="text-muted-foreground"> · {r.compound}</span> : null}</td>
                    <td className="px-3 py-2 font-mono">{r.vial ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.prepSummary ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={r.comment ?? ""}
                        disabled={sheet.status === "reviewed"}
                        onBlur={(e) => {
                          if (e.target.value !== (r.comment ?? "")) commentMut.mutate({ itemId: r.itemId, comment: e.target.value });
                        }}
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5 border-border space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Observations</h3>
            <Textarea
              rows={3}
              disabled={sheet.status === "reviewed"}
              defaultValue={sheet.narrative ?? ""}
              key={sheet.id + "-narrative"}
              onChange={(e) => setNarrative(e.target.value)}
              onBlur={() => { if (narrative !== null && narrative !== sheet.narrative) narrativeMut.mutate({ narrative }); }}
              placeholder="What happened during this run — anything worth noting."
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={sheet.status === "reviewed"}
                defaultChecked={sheet.deviation_flag}
                key={sheet.id + "-devflag"}
                onChange={(e) => { setDeviationFlag(e.target.checked); narrativeMut.mutate({ deviationFlag: e.target.checked }); }}
              />
              Deviation encountered
            </label>
            {(deviationFlag ?? sheet.deviation_flag) && (
              <Textarea
                rows={2}
                disabled={sheet.status === "reviewed"}
                defaultValue={sheet.deviation_notes ?? ""}
                key={sheet.id + "-devnotes"}
                onChange={(e) => setDeviationNotes(e.target.value)}
                onBlur={() => { if (deviationNotes !== null && deviationNotes !== sheet.deviation_notes) narrativeMut.mutate({ deviationNotes }); }}
                placeholder="Describe the deviation…"
              />
            )}
            {sheet.status === "in_progress" && (
              <Button disabled={completeMut.isPending} onClick={() => completeMut.mutate()}>
                {completeMut.isPending ? "Completing…" : "Complete Bench Sheet"}
              </Button>
            )}
          </Card>

          {sheet.status === "completed" && canReview && (
            <Card className="p-5 border-border space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Review &amp; Sign</h3>
              <Textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Review comment (optional)" />
              <Button disabled={reviewMut.isPending} onClick={() => reviewMut.mutate()}>
                {reviewMut.isPending ? "Signing…" : "Review & Sign"}
              </Button>
            </Card>
          )}
          {sheet.status === "reviewed" && (
            <Card className="p-5 border-border text-sm text-muted-foreground">
              Reviewed by {nameFor(sheet.reviewed_by)} on {sheet.reviewed_at ? new Date(sheet.reviewed_at).toLocaleString() : "—"}
              {sheet.review_comment ? ` — ${sheet.review_comment}` : ""}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

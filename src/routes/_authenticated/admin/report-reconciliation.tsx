/**
 * Exception dashboard for the automated report-reconciliation cron
 * (src/routes/api/cron/reconcile-reports.ts, triggered hourly by
 * pg_cron). High-confidence batch_id matches are already auto-applied by
 * the time anyone looks at this page — this shows what's left: lower-
 * confidence lot_code matches and ambiguous collisions that need a human
 * to pick, plus informational counts (not-yet-run samples, walk-in "No
 * COC" reports, orphan files). Applied results still go through the
 * existing Review/Approve flow in the Results tab — nothing here bypasses
 * that. Every stat card is clickable and filters the table below to that
 * category, so an analyst can drill into exactly what's behind a number.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, RefreshCw, FileQuestion, FileWarning, CircleHelp, FileX, FileStack, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { qk } from "@/lib/query-keys";
import {
  reconcileReportsReadOnly, runReconciliationNow, applyMatchedReport,
  type ReconciliationSample,
} from "@/lib/results/report-reconciliation.functions";

export const Route = createFileRoute("/_authenticated/admin/report-reconciliation")({ component: ReportReconciliationAdmin });

type Category = "batch_id" | "lot_code" | "ambiguous" | "not_run" | "no_coc" | "already_resolved" | "orphan_files";

const CATEGORY_LABEL: Record<Category, string> = {
  batch_id: "Auto-applied (batch_id)",
  lot_code: "Needs review (lot_code)",
  ambiguous: "Ambiguous",
  not_run: "Not yet run",
  no_coc: "No COC (walk-ins)",
  already_resolved: "Already resolved (extra copies)",
  orphan_files: "Orphan files",
};

function ReportReconciliationAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const readOnlyFn = useServerFn(reconcileReportsReadOnly);
  const runNowFn = useServerFn(runReconciliationNow);
  const applyFn = useServerFn(applyMatchedReport);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk.reportReconciliation.list(),
    queryFn: () => readOnlyFn(),
  });

  const [lastFailed, setLastFailed] = useState<Array<{ batch_id: string; file_name: string; error: string }>>([]);
  const [lastApplied, setLastApplied] = useState<Array<{ batch_id: string; file_name: string; chromatogram: boolean }>>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.reportReconciliation.all });

  const runNowMut = useMutation({
    mutationFn: () => runNowFn(),
    onSuccess: (r) => {
      setLastFailed(r.failed);
      setLastApplied(r.applied_results);
      if (r.failed.length > 0) {
        toast.error(`Applied ${r.applied}, ${r.failed.length} failed — see details below`);
      } else {
        toast.success(`Applied ${r.applied} result${r.applied === 1 ? "" : "s"}`);
      }
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  const applyMut = useMutation({
    mutationFn: (v: { sample_id: string; file_id: string; file_name: string }) => applyFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Result applied${r.chromatogram ? " — chromatogram captured" : ""}`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Apply failed"),
  });

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  const samples = data?.samples ?? [];
  const byTier = (t: ReconciliationSample["tier"]) => samples.filter((s) => s.tier === t);
  const batchIdRows = byTier("batch_id");
  const lotCodeRows = byTier("lot_code");
  const ambiguousRows = byTier("ambiguous");
  const notRunRows = byTier("not_run");
  const noCocFiles = data?.no_coc_files ?? [];
  const orphanFiles = data?.orphan_files ?? [];
  const alreadyResolvedFiles = data?.already_resolved_files ?? [];

  const counts: Record<Category, number> = {
    batch_id: batchIdRows.length,
    lot_code: lotCodeRows.length,
    ambiguous: ambiguousRows.length,
    not_run: notRunRows.length,
    no_coc: noCocFiles.length,
    already_resolved: alreadyResolvedFiles.length,
    orphan_files: orphanFiles.length,
  };

  function toggleCategory(c: Category) {
    setActiveCategory((cur) => (cur === c ? null : c));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Report Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Runs hourly on its own — high-confidence matches (batch_id found in the report filename) are
            auto-applied and land in Review same as any other result. Click a category below to see what's behind it.
          </p>
        </div>
        <Button onClick={() => runNowMut.mutate()} disabled={runNowMut.isPending} className="gap-2">
          <RefreshCw className={`size-4 ${runNowMut.isPending ? "animate-spin" : ""}`} />
          Run now
        </Button>
      </div>

      {lastFailed.length > 0 && (
        <Card className="border-destructive/50 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
            <AlertTriangle className="size-4" />
            {lastFailed.length} failed to apply on the last run
          </div>
          <div className="space-y-1">
            {lastFailed.map((f, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{f.batch_id}</span> — {f.error}
              </div>
            ))}
          </div>
        </Card>
      )}

      {lastApplied.length > 0 && (
        <Card className="border-border p-4 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            {lastApplied.length} applied on the last run
          </div>
          <div className="space-y-1">
            {lastApplied.map((r, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-mono text-foreground">{r.batch_id}</span>
                <span className="truncate">— {r.file_name}</span>
                {r.chromatogram ? (
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="size-3" /> chromatogram
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 text-muted-foreground/70">no chromatogram</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard icon={FileStack} label={CATEGORY_LABEL.batch_id} value={counts.batch_id} tone="good"
              active={activeCategory === "batch_id"} onClick={() => toggleCategory("batch_id")} />
            <StatCard icon={FileQuestion} label={CATEGORY_LABEL.lot_code} value={counts.lot_code} tone="warn"
              active={activeCategory === "lot_code"} onClick={() => toggleCategory("lot_code")} />
            <StatCard icon={CircleHelp} label={CATEGORY_LABEL.ambiguous} value={counts.ambiguous} tone="warn"
              active={activeCategory === "ambiguous"} onClick={() => toggleCategory("ambiguous")} />
            <StatCard icon={FileWarning} label={CATEGORY_LABEL.not_run} value={counts.not_run} tone="neutral"
              active={activeCategory === "not_run"} onClick={() => toggleCategory("not_run")} />
            <StatCard icon={FileX} label={CATEGORY_LABEL.no_coc} value={counts.no_coc} tone="neutral"
              active={activeCategory === "no_coc"} onClick={() => toggleCategory("no_coc")} />
            <StatCard icon={CheckCircle2} label={CATEGORY_LABEL.already_resolved} value={counts.already_resolved} tone="good"
              active={activeCategory === "already_resolved"} onClick={() => toggleCategory("already_resolved")} />
            <StatCard icon={FileWarning} label={CATEGORY_LABEL.orphan_files} value={counts.orphan_files} tone="neutral"
              active={activeCategory === "orphan_files"} onClick={() => toggleCategory("orphan_files")} />
          </div>

          {activeCategory === null && (
            <p className="text-sm text-muted-foreground">Click a category above to see the reports behind it.</p>
          )}

          {activeCategory && (activeCategory === "no_coc" || activeCategory === "orphan_files") && (
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="text-left px-3 py-2">{CATEGORY_LABEL[activeCategory]}</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(activeCategory === "no_coc" ? noCocFiles : orphanFiles).map((f) => (
                    <tr key={f.id}><td className="px-3 py-2 text-xs text-muted-foreground truncate">{f.name}</td></tr>
                  ))}
                  {(activeCategory === "no_coc" ? noCocFiles : orphanFiles).length === 0 && (
                    <tr><td className="px-3 py-4 text-center text-muted-foreground">Nothing here.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {activeCategory === "already_resolved" && (
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Batch ID</th>
                    <th className="text-left px-3 py-2">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alreadyResolvedFiles.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link to="/samples/$batchId" params={{ batchId: f.batch_id }} className="text-primary hover:underline">
                          {f.batch_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate">{f.name}</td>
                    </tr>
                  ))}
                  {alreadyResolvedFiles.length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Nothing here.</td></tr>
                  )}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                These files match a known sample that already has a saved result — reruns, do-overs, or the sample's own
                already-applied file. Nothing to do here; shown for reference.
              </p>
            </Card>
          )}

          {activeCategory && (activeCategory === "batch_id" || activeCategory === "lot_code" || activeCategory === "ambiguous" || activeCategory === "not_run") && (
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Batch ID</th>
                    <th className="text-left px-3 py-2">Compound</th>
                    <th className="text-left px-3 py-2">Candidate file</th>
                    <th className="text-right px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(activeCategory === "batch_id" ? batchIdRows
                    : activeCategory === "lot_code" ? lotCodeRows
                    : activeCategory === "ambiguous" ? ambiguousRows
                    : notRunRows
                  ).map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link to="/samples/$batchId" params={{ batchId: s.batch_id }} className="text-primary hover:underline">
                          {s.batch_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{s.compound ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">{s.file?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {s.file && (activeCategory === "lot_code" || activeCategory === "ambiguous") && (
                          <Button
                            size="sm" variant="outline"
                            disabled={applyMut.isPending}
                            onClick={() => applyMut.mutate({ sample_id: s.id, file_id: s.file!.id, file_name: s.file!.name })}
                          >
                            Apply
                          </Button>
                        )}
                        {activeCategory === "batch_id" && (
                          <Link to="/samples/$batchId" params={{ batchId: s.batch_id }}>
                            <Button size="sm" variant="ghost">Review</Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(activeCategory === "batch_id" ? batchIdRows
                    : activeCategory === "lot_code" ? lotCodeRows
                    : activeCategory === "ambiguous" ? ambiguousRows
                    : notRunRows
                  ).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nothing here.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {isFetching && !isLoading && <p className="text-xs text-muted-foreground mt-3">Refreshing…</p>}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, active, onClick }: {
  icon: typeof FileStack; label: string; value: number; tone: "good" | "warn" | "neutral";
  active: boolean; onClick: () => void;
}) {
  const toneClass = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-400" : "text-muted-foreground";
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={`p-4 border-border transition-colors hover:border-primary/50 ${active ? "border-primary ring-1 ring-primary" : ""}`}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className={`size-3.5 ${toneClass}`} />
          {label}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </Card>
    </button>
  );
}

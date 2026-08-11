/**
 * Exception dashboard for the automated report-reconciliation cron
 * (src/routes/api/cron/reconcile-reports.ts, triggered hourly by
 * pg_cron). High-confidence batch_id matches are already auto-applied by
 * the time anyone looks at this page — this shows what's left: lower-
 * confidence lot_code matches and ambiguous collisions that need a human
 * to pick, plus informational counts (not-yet-run samples, walk-in "No
 * COC" reports, orphan files). Applied results still go through the
 * existing Review/Approve flow in the Results tab — nothing here bypasses
 * that.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, RefreshCw, FileQuestion, FileWarning, CircleHelp, FileX, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { qk } from "@/lib/query-keys";
import {
  reconcileReportsReadOnly, runReconciliationNow, applyMatchedReport,
  type ReconciliationSample,
} from "@/lib/results/report-reconciliation.functions";

export const Route = createFileRoute("/_authenticated/admin/report-reconciliation")({ component: ReportReconciliationAdmin });

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

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.reportReconciliation.all });

  const runNowMut = useMutation({
    mutationFn: () => runNowFn(),
    onSuccess: (r) => { toast.success(`Applied ${r.applied} result${r.applied === 1 ? "" : "s"}`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  const applyMut = useMutation({
    mutationFn: (v: { sample_id: string; file_id: string; file_name: string }) => applyFn({ data: v }),
    onSuccess: () => { toast.success("Result applied"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Apply failed"),
  });

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  const samples = data?.samples ?? [];
  const byTier = (t: ReconciliationSample["tier"]) => samples.filter((s) => s.tier === t);
  const batchIdCount = byTier("batch_id").length;
  const lotCodeRows = byTier("lot_code");
  const ambiguousRows = byTier("ambiguous");
  const notRunCount = byTier("not_run").length;
  const noCocCount = data?.no_coc_files.length ?? 0;
  const orphanCount = data?.orphan_files.length ?? 0;

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
            auto-applied and land in Review same as any other result. This page shows what's left over.
          </p>
        </div>
        <Button onClick={() => runNowMut.mutate()} disabled={runNowMut.isPending} className="gap-2">
          <RefreshCw className={`size-4 ${runNowMut.isPending ? "animate-spin" : ""}`} />
          Run now
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard icon={FileStack} label="Auto-applied (batch_id)" value={batchIdCount} tone="good" />
            <StatCard icon={FileQuestion} label="Needs review (lot_code)" value={lotCodeRows.length} tone="warn" />
            <StatCard icon={CircleHelp} label="Ambiguous" value={ambiguousRows.length} tone="warn" />
            <StatCard icon={FileWarning} label="Not yet run" value={notRunCount} tone="neutral" />
            <StatCard icon={FileX} label="No COC (walk-ins)" value={noCocCount} tone="neutral" />
            <StatCard icon={FileWarning} label="Orphan files" value={orphanCount} tone="neutral" />
          </div>

          {(lotCodeRows.length > 0 || ambiguousRows.length > 0) && (
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Batch ID</th>
                    <th className="text-left px-3 py-2">Compound</th>
                    <th className="text-left px-3 py-2">Tier</th>
                    <th className="text-left px-3 py-2">Candidate file</th>
                    <th className="text-right px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...lotCodeRows, ...ambiguousRows].map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-mono text-xs">{s.batch_id}</td>
                      <td className="px-3 py-2">{s.compound ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{s.tier.replace("_", " ")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">{s.file?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {s.file && (
                          <Button
                            size="sm" variant="outline"
                            disabled={applyMut.isPending}
                            onClick={() => applyMut.mutate({ sample_id: s.id, file_id: s.file!.id, file_name: s.file!.name })}
                          >
                            Apply
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {lotCodeRows.length === 0 && ambiguousRows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing needs manual attention right now.</p>
          )}
          {isFetching && !isLoading && <p className="text-xs text-muted-foreground mt-3">Refreshing…</p>}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: {
  icon: typeof FileStack; label: string; value: number; tone: "good" | "warn" | "neutral";
}) {
  const toneClass = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-400" : "text-muted-foreground";
  return (
    <Card className="p-4 border-border">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={`size-3.5 ${toneClass}`} />
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}

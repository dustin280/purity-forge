import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getSampleDetail, updateSampleStatus, saveResult } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/lims/status-pill";
import { generateCoaPdf } from "@/lib/coa-pdf";
import { type SampleStatus, type Peak } from "@/lib/lims-utils";
import { toast } from "sonner";
import { Download, ChevronRight } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { InfoRow } from "@/components/samples/info-row";
import { ResultsTab } from "@/components/samples/results-tab";
import { parsePeaks } from "@/lib/parse-peaks";
export const Route = createFileRoute("/_authenticated/samples/$batchId")({ component: SampleDetail });

function SampleDetail() {
  const { batchId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getSampleDetail);
  const setStatusFn = useServerFn(updateSampleStatus);
  const saveResultFn = useServerFn(saveResult);
  const { data, isLoading } = useQuery({
    queryKey: qk.samples.detail(batchId),
    queryFn: () => fn({ data: { batchId } }),
  });

  const [tab, setTab] = useState<"info" | "results" | "coa">("info");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { sample, tests, results } = data;
  const test = tests[0];
  const latestResult = results[results.length - 1];
  const peaks: Peak[] = (latestResult?.peak_details as Peak[] | null) ?? [];

  async function changeStatus(status: SampleStatus) {
    setBusy(true);
    try {
      await setStatusFn({ data: { sampleId: sample.id, status } });
      toast.success(`Status → ${status}`);
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  async function submitResult() {
    if (!test) return toast.error("No test assigned");
    const { peaks, purity } = parsePeaks(pasted);
    if (peaks.length === 0) return toast.error("Paste at least one peak (rt area area_pct)");
    setBusy(true);
    try {
      await saveResultFn({ data: { testId: test.id, purity_percentage: purity, peaks } });
      await setStatusFn({ data: { sampleId: sample.id, status: "in_progress" } });
      toast.success(`Result saved — ${purity.toFixed(2)}% purity`);
      setPasted("");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  function downloadCoa() {
    if (!test || !latestResult) return toast.error("No result to certify");
    const pdf = generateCoaPdf({
      sample: { batch_id: sample.batch_id, client: sample.client, project: sample.project, receipt_date: sample.receipt_date, notes: sample.notes },
      test: { method_name: test.method_name, instrument: test.instrument, parameters: test.parameters as Record<string, unknown> | null },
      result: {
        purity_percentage: latestResult.purity_percentage,
        analysis_date: latestResult.analysis_date,
        peak_details: peaks,
      },
      analyst: latestResult.analyst_id,
      reviewer: latestResult.reviewer_id,
      approved_at: latestResult.approved_at,
    });
    pdf.save(`COA_${sample.batch_id}.pdf`);
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center text-xs text-muted-foreground gap-1">
        <Link to="/samples" className="hover:text-foreground">Samples</Link>
        <ChevronRight className="size-3" />
        <span className="font-mono">{sample.batch_id}</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">{sample.batch_id}</h1>
          <p className="text-sm text-muted-foreground mt-1">{sample.client}{sample.project ? ` · ${sample.project}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={sample.status as SampleStatus} />
          <div className="flex gap-1.5">
            {sample.status === "prep" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus("in_progress")}>Start Analysis</Button>
            )}
            {sample.status === "in_progress" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus("reviewed")}>Mark In Review</Button>
            )}
            {sample.status === "reviewed" && (
              <Button size="sm" disabled={busy} onClick={() => changeStatus("complete")}>Mark Complete</Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["info", "results", "coa"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold border-b-2 -mb-px ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "coa" ? "COA" : t}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5 border-border">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Sample</h3>
            <dl className="space-y-2 text-sm">
              <InfoRow k="Client" v={sample.client} />
              <InfoRow k="Project" v={sample.project ?? "—"} />
              <InfoRow k="Compound" v={(sample as { compound?: string | null }).compound ?? "—"} />
              <InfoRow k="Lot" v={(sample as { lot?: string | null }).lot ?? "—"} />
              <InfoRow k="Receipt" v={sample.receipt_date} />
              <InfoRow k="Created" v={new Date(sample.created_at).toLocaleString()} />
              <InfoRow k="Notes" v={sample.notes ?? "—"} />
            </dl>
          </Card>
          <Card className="p-5 border-border">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Test Method</h3>
            <dl className="space-y-2 text-sm">
              <InfoRow k="Method" v={test?.method_name ?? "—"} />
              <InfoRow k="Instrument" v={test?.instrument ?? "—"} />
              <InfoRow k="Status" v={test?.status ?? "—"} />
            </dl>
          </Card>
        </div>
      )}

      {tab === "results" && (
        <ResultsTab
          latestResult={latestResult ? { purity_percentage: latestResult.purity_percentage, analysis_date: latestResult.analysis_date } : null}
          peaks={peaks}
          pasted={pasted}
          setPasted={setPasted}
          onSubmit={submitResult}
          busy={busy}
        />
      )}

      {tab === "coa" && (
        <Card className="p-6 border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Certificate of Analysis</h3>
              <p className="text-xs text-muted-foreground mt-1">Generates a signed COA PDF with sample, method, peak table, and signature blocks.</p>
            </div>
            <Button onClick={downloadCoa} disabled={!latestResult}>
              <Download className="size-4 mr-1" />Download COA
            </Button>
          </div>
          {!latestResult && <p className="text-xs text-muted-foreground mt-4">Save a result first to generate the COA.</p>}
        </Card>
      )}
    </div>
  );
}
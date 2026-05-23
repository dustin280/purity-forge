import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getSampleDetail, updateSampleStatus, saveResult } from "@/lib/lims.functions";
import { generateCoaPdf } from "@/lib/coa-pdf";
import { type SampleStatus, type Peak } from "@/lib/lims-utils";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { ResultsTab } from "@/components/samples/results-tab";
import { parsePeaks } from "@/lib/parse-peaks";
import { SampleDetailHeader } from "@/components/samples/detail-header";
import { SampleDetailTabs, type SampleDetailTab } from "@/components/samples/detail-tabs";
import { SampleInfoTab } from "@/components/samples/info-tab";
import { CoaTab } from "@/components/samples/coa-tab";
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

  const [tab, setTab] = useState<SampleDetailTab>("info");
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
      <SampleDetailHeader
        batchId={sample.batch_id}
        client={sample.client}
        project={sample.project}
        status={sample.status as SampleStatus}
        busy={busy}
        onChangeStatus={changeStatus}
      />

      <SampleDetailTabs tab={tab} setTab={setTab} />

      {tab === "info" && <SampleInfoTab sample={sample as never} test={test as never} />}

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

      {tab === "coa" && <CoaTab onDownload={downloadCoa} hasResult={!!latestResult} />}
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type SampleStatus, type Peak } from "@/lib/lims-utils";
import { ResultsTab } from "@/components/samples/results-tab";
import { SampleDetailHeader } from "@/components/samples/detail-header";
import { SampleDetailTabs, type SampleDetailTab } from "@/components/samples/detail-tabs";
import { SampleInfoTab } from "@/components/samples/info-tab";
import { CoaTab } from "@/components/samples/coa-tab";
import { useSampleDetail } from "@/components/samples/use-sample-detail";
import { downloadCoa } from "@/components/samples/download-coa";
export const Route = createFileRoute("/_authenticated/samples/$batchId")({ component: SampleDetail });

function SampleDetail() {
  const { batchId } = Route.useParams();
  const { query, busy, changeStatus, submitResult } = useSampleDetail(batchId);
  const { data, isLoading } = query;
  const [tab, setTab] = useState<SampleDetailTab>("info");
  const [pasted, setPasted] = useState("");

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { sample, tests, results } = data;
  const test = tests[0];
  const latestResult = results[results.length - 1];
  const peaks: Peak[] = (latestResult?.peak_details as Peak[] | null) ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <SampleDetailHeader
        batchId={sample.batch_id}
        client={sample.client}
        project={sample.project}
        status={sample.status as SampleStatus}
        busy={busy}
        onChangeStatus={status => changeStatus(sample.id, status)}
      />

      <SampleDetailTabs tab={tab} setTab={setTab} />

      {tab === "info" && <SampleInfoTab sample={sample as never} test={test as never} />}

      {tab === "results" && (
        <ResultsTab
          latestResult={latestResult ? { purity_percentage: latestResult.purity_percentage, analysis_date: latestResult.analysis_date } : null}
          peaks={peaks}
          pasted={pasted}
          setPasted={setPasted}
          onSubmit={() => submitResult({ testId: test?.id, sampleId: sample.id, pasted, onCleared: () => setPasted("") })}
          busy={busy}
        />
      )}

      {tab === "coa" && <CoaTab onDownload={() => downloadCoa(sample, test, latestResult, peaks)} hasResult={!!latestResult} />}
    </div>
  );
}
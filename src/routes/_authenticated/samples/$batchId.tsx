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
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
export const Route = createFileRoute("/_authenticated/samples/$batchId")({ component: SampleDetail });

function SampleDetail() {
  const { batchId } = Route.useParams();
  const { query, busy, changeStatus, submitResult, reviewLatestResult, approveLatestResult } = useSampleDetail(batchId);
  const { user } = useAuth();
  const { data, isLoading } = query;
  const [tab, setTab] = useState<SampleDetailTab>("info");
  const [pasted, setPasted] = useState("");

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { sample, tests, results, profiles } = data;
  const test = tests[0];
  const latestResult = results[results.length - 1];
  const peaks: Peak[] = (latestResult?.peak_details as Peak[] | null) ?? [];
  const nameFor = (id: string | null) => {
    if (!id) return null;
    const p = profiles.find(p => p.id === id);
    return p ? profileDisplayName(p, id) : id;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <SampleDetailHeader
        batchId={sample.batch_id}
        client={sample.client}
        project={sample.project}
        status={sample.status as SampleStatus}
        busy={busy}
        onChangeStatus={status => changeStatus(sample.id, status)}
        resultReviewed={!!latestResult?.reviewed_at}
        resultApproved={!!latestResult?.approved_at}
      />

      <SampleDetailTabs tab={tab} setTab={setTab} />

      {tab === "info" && <SampleInfoTab sample={sample as never} test={test as never} batchId={batchId} />}

      {tab === "results" && (
        <ResultsTab
          latestResult={latestResult ? {
            id: latestResult.id,
            purity_percentage: latestResult.purity_percentage,
            analysis_date: latestResult.analysis_date,
            analyst_id: latestResult.analyst_id,
            reviewer_id: latestResult.reviewer_id,
            reviewed_at: latestResult.reviewed_at,
            approved_at: latestResult.approved_at,
          } : null}
          peaks={peaks}
          pasted={pasted}
          setPasted={setPasted}
          onSubmit={() => submitResult({ testId: test?.id, sampleId: sample.id, pasted, onCleared: () => setPasted("") })}
          busy={busy}
          spec={{ spec_min: (test as { spec_min?: number | null } | undefined)?.spec_min ?? null, spec_max: (test as { spec_max?: number | null } | undefined)?.spec_max ?? null }}
          currentUserId={user?.id ?? null}
          onReview={reviewLatestResult}
          onApprove={approveLatestResult}
        />
      )}

      {tab === "coa" && (
        <CoaTab
          onDownload={() => downloadCoa(
            sample, test, latestResult, peaks,
            { analystName: nameFor(latestResult?.analyst_id ?? null), reviewerName: nameFor(latestResult?.reviewer_id ?? null) },
          )}
          hasResult={!!latestResult}
        />
      )}
    </div>
  );
}
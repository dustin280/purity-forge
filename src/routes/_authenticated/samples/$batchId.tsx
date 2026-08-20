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
import { NonchromResultCard } from "@/components/samples/nonchrom/nonchrom-result-card";
import type { CalibrationData } from "@/lib/results/drive-reports.functions";
export const Route = createFileRoute("/_authenticated/samples/$batchId")({ component: SampleDetail });

function SampleDetail() {
  const { batchId } = Route.useParams();
  const { query, busy, changeStatus, submitResult, submitNonchromResult, reviewLatestResult, approveLatestResult } = useSampleDetail(batchId);
  const { user } = useAuth();
  const { data, isLoading } = query;
  const [tab, setTab] = useState<SampleDetailTab>("info");
  const [pasted, setPasted] = useState("");

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { sample, tests, results, profiles, nonchromResults } = data;
  // Multiple tests can exist per sample now (purity + any flagged
  // sterility/endotoxin/heavy-metals) — the purity one drives the sample's
  // own status/spec/COA, same as the single test every sample used to have.
  const test = tests.find(t => t.test_type === "purity") ?? tests[0];
  const nonPurityTests = tests.filter(t => t.test_type !== "purity");
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
            chromatogram_image: (latestResult as { chromatogram_image?: string | null }).chromatogram_image ?? null,
            calibration_image: (latestResult as { calibration_image?: string | null }).calibration_image ?? null,
            calibration_data: (latestResult as { calibration_data?: CalibrationData | null }).calibration_data ?? null,
            raw_data_file_path: (latestResult as { raw_data_file_path?: string | null }).raw_data_file_path ?? null,
            uv_conf_match: (latestResult as { uv_conf_match?: number | null }).uv_conf_match ?? null,
            wavelength_nm: (latestResult as { wavelength_nm?: number | null }).wavelength_nm ?? null,
            report_metadata: (latestResult as { report_metadata?: Record<string, string> | null }).report_metadata ?? null,
          } : null}
          peaks={peaks}
          pasted={pasted}
          setPasted={setPasted}
          onSubmit={(imported) => submitResult({ testId: test?.id, sampleId: sample.id, pasted, imported, onCleared: () => setPasted("") })}
          busy={busy}
          batchId={batchId}
          spec={{ spec_min: (test as { spec_min?: number | null } | undefined)?.spec_min ?? null, spec_max: (test as { spec_max?: number | null } | undefined)?.spec_max ?? null }}
          currentUserId={user?.id ?? null}
          onReview={reviewLatestResult}
          onApprove={approveLatestResult}
        />
      )}

      {tab === "results" && nonPurityTests.map(t => {
        // nonchromResults is ordered newest-first (see getSampleDetail), so
        // the first match per test_id is the latest entry.
        const latest = nonchromResults.find(r => r.test_id === t.id) ?? null;
        return (
          <NonchromResultCard
            key={t.id}
            test={t}
            latest={latest}
            analystName={nameFor(latest?.analyst_id ?? null)}
            busy={busy}
            onSave={(testType, resultData) => submitNonchromResult({ test_type: testType, testId: t.id, data: resultData })}
          />
        );
      })}

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
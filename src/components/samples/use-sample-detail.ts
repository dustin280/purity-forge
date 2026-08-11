import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSampleDetail, updateSampleStatus, saveResult, reviewResult, approveResult } from "@/lib/lims.functions";
import { type SampleStatus, type Peak } from "@/lib/lims-utils";
import { qk } from "@/lib/query-keys";
import { parsePeaks } from "@/lib/parse-peaks";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";

export function useSampleDetail(batchId: string) {
  const qc = useQueryClient();
  const signalWorkflowEvent = useWorkflowSignal();
  const fn = useServerFn(getSampleDetail);
  const setStatusFn = useServerFn(updateSampleStatus);
  const saveResultFn = useServerFn(saveResult);
  const reviewResultFn = useServerFn(reviewResult);
  const approveResultFn = useServerFn(approveResult);

  const query = useQuery({
    queryKey: qk.samples.detail(batchId),
    queryFn: () => fn({ data: { batchId } }),
  });

  useEffect(() => {
    if (query.isSuccess) signalWorkflowEvent("sample-opened");
  }, [query.isSuccess, batchId, signalWorkflowEvent]);

  const [busy, setBusy] = useState(false);

  async function changeStatus(sampleId: string, status: SampleStatus) {
    setBusy(true);
    try {
      await setStatusFn({ data: { sampleId, status } });
      toast.success(`Status → ${status}`);
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  async function submitResult(args: {
    testId: string | undefined; sampleId: string; pasted: string;
    imported?: { peaks: Peak[]; purity: number; raw_data_file_path: string | null; analysis_date: string | null } | null;
    onCleared: () => void;
  }) {
    if (!args.testId) return toast.error("No test assigned");
    const { peaks, purity, raw_data_file_path, analysis_date } = args.imported
      ? {
          peaks: args.imported.peaks, purity: args.imported.purity,
          raw_data_file_path: args.imported.raw_data_file_path, analysis_date: args.imported.analysis_date,
        }
      : { ...parsePeaks(args.pasted), raw_data_file_path: null as string | null, analysis_date: null as string | null };
    if (peaks.length === 0) return toast.error("Paste at least one peak (rt area area_pct), or import a report");
    setBusy(true);
    try {
      await saveResultFn({ data: { testId: args.testId, purity_percentage: purity, peaks, raw_data_file_path, analysis_date } });
      await setStatusFn({ data: { sampleId: args.sampleId, status: "in_progress" } });
      toast.success(`Result saved — ${purity.toFixed(2)}% purity`);
      signalWorkflowEvent("result-submitted");
      args.onCleared();
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function reviewLatestResult(resultId: string) {
    setBusy(true);
    try {
      await reviewResultFn({ data: { resultId } });
      toast.success("Result reviewed");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Review failed"); }
    finally { setBusy(false); }
  }

  async function approveLatestResult(resultId: string) {
    setBusy(true);
    try {
      await approveResultFn({ data: { resultId } });
      toast.success("Result approved");
      signalWorkflowEvent("sample-approved");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Approval failed"); }
    finally { setBusy(false); }
  }

  return { query, busy, changeStatus, submitResult, reviewLatestResult, approveLatestResult };
}
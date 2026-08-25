import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSampleDetail, updateSampleStatus, saveResult, reviewResult, approveResult, saveNonchromResult, setPurityWaived } from "@/lib/lims.functions";
import { type SampleStatus, type Peak } from "@/lib/lims-utils";
import { qk } from "@/lib/query-keys";
import { parsePeaks } from "@/lib/parse-peaks";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";
import type { CalibrationData } from "@/lib/results/drive-reports.functions";
import type { SterilityData } from "@/components/samples/nonchrom/sterility-fields";
import type { EndotoxinData } from "@/components/samples/nonchrom/endotoxin-fields";
import type { HeavyMetalsData } from "@/components/samples/nonchrom/heavy-metals-fields";

// Loose rather than a strict discriminated union: NonchromResultCard's
// onSave callback (shared across all three field forms) can't correlate
// test_type with data at the type level, only at the call site inside each
// *-fields.tsx component (which always pairs them correctly). The server's
// Zod discriminatedUnion in saveNonchromResult is the actual safety net.
type NonchromSaveArgs = {
  test_type: "sterility" | "endotoxin" | "heavy_metals";
  testId: string;
  data: SterilityData | EndotoxinData | HeavyMetalsData;
};

export function useSampleDetail(batchId: string) {
  const qc = useQueryClient();
  const signalWorkflowEvent = useWorkflowSignal();
  const fn = useServerFn(getSampleDetail);
  const setStatusFn = useServerFn(updateSampleStatus);
  const setPurityWaivedFn = useServerFn(setPurityWaived);
  const saveResultFn = useServerFn(saveResult);
  const reviewResultFn = useServerFn(reviewResult);
  const approveResultFn = useServerFn(approveResult);
  const saveNonchromResultFn = useServerFn(saveNonchromResult);

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
    imported?: {
      peaks: Peak[]; purity: number; raw_data_file_path: string | null; analysis_date: string | null;
      chromatogram_image: string | null; calibration_image: string | null; calibration_data: CalibrationData | null;
      uv_conf_match: number | null; wavelength_nm: number | null;
      report_metadata: Record<string, string> | null;
    } | null;
    onCleared: () => void;
  }) {
    if (!args.testId) return toast.error("No test assigned");
    const { peaks, purity, raw_data_file_path, analysis_date, chromatogram_image, calibration_image, calibration_data, uv_conf_match, wavelength_nm, report_metadata } = args.imported
      ? {
          peaks: args.imported.peaks, purity: args.imported.purity,
          raw_data_file_path: args.imported.raw_data_file_path, analysis_date: args.imported.analysis_date,
          chromatogram_image: args.imported.chromatogram_image,
          calibration_image: args.imported.calibration_image, calibration_data: args.imported.calibration_data,
          uv_conf_match: args.imported.uv_conf_match, wavelength_nm: args.imported.wavelength_nm,
          report_metadata: args.imported.report_metadata,
        }
      : {
          ...parsePeaks(args.pasted), raw_data_file_path: null as string | null, analysis_date: null as string | null,
          chromatogram_image: null as string | null, calibration_image: null as string | null,
          calibration_data: null as CalibrationData | null,
          uv_conf_match: null as number | null,
          wavelength_nm: null as number | null, report_metadata: null as Record<string, string> | null,
        };
    if (peaks.length === 0) return toast.error("Paste at least one peak (rt area area_pct), or import a report");
    setBusy(true);
    try {
      await saveResultFn({ data: { testId: args.testId, purity_percentage: purity, peaks, raw_data_file_path, analysis_date, chromatogram_image, calibration_image, calibration_data, uv_conf_match, wavelength_nm, report_metadata } });
      // Only meaningful the first time a sample gets a result ("prep" ->
      // "in_progress") — re-entering a result on a sample that's already
      // moved past that (reviewed, approved, etc.) hits a transition the
      // state machine correctly rejects. That's not a save failure, so
      // don't let it block the success toast or leave the form populated
      // for a save that actually went through (same non-critical
      // treatment report-reconciliation.functions.ts already gives this).
      try {
        await setStatusFn({ data: { sampleId: args.sampleId, status: "in_progress" } });
      } catch { /* non-critical — result is saved either way */ }
      toast.success(`Result saved — ${purity.toFixed(2)}% purity`);
      signalWorkflowEvent("result-submitted");
      args.onCleared();
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  // Unlike submitResult, this never touches the sample's own status — Micro
  // (sterility/endotoxin) and heavy metals results append to the sample
  // whenever they're ready, independent of purity's own review/approve/
  // complete lifecycle. See use of provisionTestsForSample.
  async function submitNonchromResult(args: NonchromSaveArgs) {
    setBusy(true);
    try {
      await saveNonchromResultFn({ data: args });
      toast.success(`${args.test_type === "heavy_metals" ? "Heavy metals" : args.test_type[0].toUpperCase() + args.test_type.slice(1)} result saved`);
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function reviewLatestResult(resultId: string) {
    setBusy(true);
    try {
      await reviewResultFn({ data: { resultId } });
      toast.success("Reviewed and approved — sample complete");
      signalWorkflowEvent("sample-approved");
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

  async function setPurityWaivedState(sampleId: string, waived: boolean) {
    setBusy(true);
    try {
      await setPurityWaivedFn({ data: { sampleId, waived } });
      toast.success(waived ? "Purity requirement waived" : "Purity requirement restored");
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  return { query, busy, changeStatus, submitResult, submitNonchromResult, reviewLatestResult, approveLatestResult, setPurityWaivedState };
}
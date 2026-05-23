import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getSampleDetail, updateSampleStatus, saveResult } from "@/lib/lims.functions";
import { type SampleStatus } from "@/lib/lims-utils";
import { qk } from "@/lib/query-keys";
import { parsePeaks } from "@/lib/parse-peaks";

export function useSampleDetail(batchId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(getSampleDetail);
  const setStatusFn = useServerFn(updateSampleStatus);
  const saveResultFn = useServerFn(saveResult);

  const query = useQuery({
    queryKey: qk.samples.detail(batchId),
    queryFn: () => fn({ data: { batchId } }),
  });

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

  async function submitResult(args: { testId: string | undefined; sampleId: string; pasted: string; onCleared: () => void }) {
    if (!args.testId) return toast.error("No test assigned");
    const { peaks, purity } = parsePeaks(args.pasted);
    if (peaks.length === 0) return toast.error("Paste at least one peak (rt area area_pct)");
    setBusy(true);
    try {
      await saveResultFn({ data: { testId: args.testId, purity_percentage: purity, peaks } });
      await setStatusFn({ data: { sampleId: args.sampleId, status: "in_progress" } });
      toast.success(`Result saved — ${purity.toFixed(2)}% purity`);
      args.onCleared();
      qc.invalidateQueries({ queryKey: qk.samples.detail(batchId) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return { query, busy, changeStatus, submitResult };
}
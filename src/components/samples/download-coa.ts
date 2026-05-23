import { generateCoaPdf } from "@/lib/coa-pdf";
import type { Peak } from "@/lib/lims-utils";
import { toast } from "sonner";

type Sample = { batch_id: string; client: string; project: string | null; receipt_date: string; notes: string | null };
type Test = { method_name: string; instrument: string; parameters: unknown };
type Result = { purity_percentage: number; analysis_date: string; analyst_id: string | null; reviewer_id: string | null; approved_at: string | null };

export function downloadCoa(sample: Sample, test: Test | undefined, latestResult: Result | undefined, peaks: Peak[]) {
  if (!test || !latestResult) return toast.error("No result to certify");
  const pdf = generateCoaPdf({
    sample,
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
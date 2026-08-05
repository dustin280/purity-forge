import { generateCoaPdf } from "@/lib/coa-pdf";
import type { Peak } from "@/lib/lims-utils";
import { toast } from "sonner";

type Sample = { batch_id: string; client: string; project: string | null; receipt_date: string; notes: string | null };
type Test = { method_name: string; instrument: string; parameters: unknown; spec_min?: number | null; spec_max?: number | null };
type Result = { purity_percentage: number | null; analysis_date: string; analyst_id: string | null; reviewer_id: string | null; approved_at: string | null };
type Names = { analystName: string | null; reviewerName: string | null };

export function downloadCoa(sample: Sample, test: Test | undefined, latestResult: Result | undefined, peaks: Peak[], names: Names) {
  if (!test || !latestResult) return toast.error("No result to certify");
  const pdf = generateCoaPdf({
    sample,
    test: {
      method_name: test.method_name, instrument: test.instrument,
      parameters: test.parameters as Record<string, unknown> | null,
      spec_min: test.spec_min ?? null, spec_max: test.spec_max ?? null,
    },
    result: {
      purity_percentage: latestResult.purity_percentage,
      analysis_date: latestResult.analysis_date,
      peak_details: peaks,
    },
    analyst: names.analystName,
    reviewer: names.reviewerName,
    approved_at: latestResult.approved_at,
  });
  pdf.save(`COA_${sample.batch_id}.pdf`);
}

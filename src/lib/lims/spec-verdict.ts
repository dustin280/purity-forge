// Computes a pass/fail verdict for a purity result against a test's optional
// acceptance-criteria range. No default thresholds are assumed — a test with
// no spec on file always returns null so the UI can show a neutral state
// instead of a false pass/fail.
export type SpecRange = { spec_min: number | null; spec_max: number | null };
export type Verdict = "pass" | "fail" | null;

export function purityVerdict(purity: number | null, spec: SpecRange): Verdict {
  if (purity == null || Number.isNaN(purity)) return null;
  if (spec.spec_min == null || spec.spec_max == null) return null;
  return purity >= spec.spec_min && purity <= spec.spec_max ? "pass" : "fail";
}

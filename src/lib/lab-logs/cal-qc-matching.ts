/**
 * Compound-name matching and concentration extraction for the Cal Std / QC
 * peak-trend watcher.
 */

type SupabaseClientLike = import("@supabase/supabase-js").SupabaseClient;

export type MatchConfidence = "exact" | "fuzzy" | "unmatched";

/**
 * Matches a raw compound name (as it appears in an ACAML peak result)
 * against the `compounds` registry — the same table intake/run-lists/
 * parameter-scouting already treat as canonical, rather than `sp_analytes`
 * directly. Tiered confidence mirrors report-reconciliation.functions.ts's
 * batch_id/lot_code tiers: exact case-insensitive match first, then a
 * substring-either-direction fallback, else unmatched (never guesses).
 */
export async function matchCompound(
  supabase: SupabaseClientLike,
  rawName: string,
): Promise<{ compoundId: string | null; confidence: MatchConfidence }> {
  const clean = rawName.trim();
  if (!clean) return { compoundId: null, confidence: "unmatched" };

  const { data: exact } = await supabase.from("compounds").select("id").ilike("name", clean).maybeSingle();
  if (exact) return { compoundId: exact.id, confidence: "exact" };

  const { data: all } = await supabase.from("compounds").select("id, name");
  const lower = clean.toLowerCase();
  const fuzzy = (all ?? []).find((c: { id: string; name: string }) => {
    const n = c.name.toLowerCase();
    return lower.includes(n) || n.includes(lower);
  });
  if (fuzzy) return { compoundId: fuzzy.id, confidence: "fuzzy" };

  return { compoundId: null, confidence: "unmatched" };
}

// None of these unit strings contain regex metacharacters, so they're safe
// to join into an alternation as-is.
const UNIT_ALIASES = ["ng/ml", "ug/ml", "µg/ml", "mg/ml", "ppm", "%"];
const CONCENTRATION_RE = new RegExp(`([\\d.]+)\\s*(${UNIT_ALIASES.join("|")})`, "i");

/**
 * First-pass extractor — finds the first "number + adjacent unit" in a raw
 * Sample Name (e.g. "Cagrilintide 0.05 mg/ml 2026-08-10 20:31:56-07:00" →
 * {value: 0.05, unit: "mg/ml"}). Deliberately simple; the lab's real
 * naming conventions should be checked against this once real folders are
 * connected, the same way drive-reports.functions.ts's report parser was
 * validated after the fact.
 */
export function extractConcentration(sampleName: string): { value: number | null; unit: string | null } {
  const m = sampleName.match(CONCENTRATION_RE);
  if (!m) return { value: null, unit: null };
  return { value: Number(m[1]), unit: m[2] };
}

/**
 * Shared by createSample and verifySampleIntake — both need to turn a
 * sample's flagged "requested tests" (samples.parameters, sourced from the
 * admin-editable test_parameters picklist) into actual `tests` rows. Every
 * sample always gets a purity test; sterility/endotoxin/heavy-metals tests
 * are provisioned additionally when test_parameters.maps_to_test_type says
 * a flagged parameter routes to one. Routing keys off maps_to_test_type
 * (stable), never off the parameter's display name (freely renamable).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/queue/scheduler.server";

type NonPurityType = "sterility" | "endotoxin" | "heavy_metals";

const FLAG_TEST_DEFAULTS: Record<NonPurityType, { method_name: string; instrument: string; suffix: string }> = {
  sterility: { method_name: "Sterility Testing (USP <71>)", instrument: "Manual / In-house", suffix: "ST" },
  endotoxin: { method_name: "Bacterial Endotoxin Test", instrument: "Manual / In-house", suffix: "EN" },
  heavy_metals: { method_name: "Heavy Metals (Hg/Pb/As/Cd)", instrument: "Outsourced", suffix: "HM" },
};

// Sterility/endotoxin/heavy-metals turnaround doesn't run on the lab's own
// HPLC schedule (Micro has its own process; heavy metals is outsourced), so
// the flat chromatography tat_days (queue_config, default 5) doesn't apply
// -- Dustin's call (2026-08-26): give these a fixed 14-day due date instead,
// overriding whatever the samples-insert trigger (set_sample_due_date)
// already computed from tat_days.
const NON_CHROM_TAT_DAYS = 14;

export async function provisionTestsForSample(
  supabase: SupabaseClient,
  sample: { id: string; batch_id: string },
  parameters: string[],
  userId: string | null,
  receiptDate: string,
): Promise<void> {
  const { data: existing } = await supabase.from("tests").select("id,test_type").eq("sample_id", sample.id);
  const existingTypes = new Set((existing ?? []).map((t) => t.test_type as string));

  if (!existingTypes.has("purity")) {
    await supabase.from("tests").insert({
      sample_id: sample.id, test_type: "purity",
      method_name: "Peptide Purity HPLC-DAD", instrument: "Agilent 1290 DAD", assigned_tech: userId,
    });
  }
  if (parameters.length === 0) return;

  const { data: flagRows } = await supabase
    .from("test_parameters").select("name,maps_to_test_type")
    .in("name", parameters).not("maps_to_test_type", "is", null);
  const flaggedTypes = new Set((flagRows ?? []).map((r) => r.maps_to_test_type as string));

  let hasNonChromType = false;
  for (const testType of flaggedTypes) {
    if (testType === "purity") continue;
    if ((["sterility", "endotoxin", "heavy_metals"] as string[]).includes(testType)) hasNonChromType = true;
    if (existingTypes.has(testType)) continue;
    const cfg = FLAG_TEST_DEFAULTS[testType as NonPurityType];
    if (!cfg) continue; // unmapped/future type not wired here yet — skip rather than crash intake
    await supabase.from("tests").insert({
      sample_id: sample.id, test_type: testType,
      method_name: cfg.method_name, instrument: cfg.instrument, assigned_tech: userId,
      sub_id: `${sample.batch_id}-${cfg.suffix}`,
    });
  }

  if (hasNonChromType) {
    await supabase.from("samples").update({ due_date: addDays(receiptDate, NON_CHROM_TAT_DAYS) }).eq("id", sample.id);
  }
}

/**
 * Sterility/endotoxin/heavy-metals results — unlike purity's `results`
 * table, there's no in-app review/approve step here: sterility and
 * endotoxin go through Micro's own independent review process before ever
 * reaching Lab Manager, and heavy metals (outsourced for now) is already
 * reviewed by the outside lab before it's transcribed here. Entering a row
 * is final. See supabase/migrations/20260819020000_multi_analyte_tests.sql.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { releaseSlotForSample } from "@/lib/lims/storage-assignment.functions";

// FTM and TSB are read independently (USP <71> direct inoculation) —
// verdict is derived server-side below (fail if either tube shows growth),
// same spirit as endotoxin's derived pass/fail, rather than trusted from
// the client.
const sterilityData = z.object({
  ftm_result: z.enum(["clear", "turbid"]),
  tsb_result: z.enum(["clear", "turbid"]),
  method: z.string().min(1).max(255),
  notes: z.string().max(2000).optional().nullable(),
});

// No per-product limit here -- it's highly variable and never reported on
// the COA. The analyst asserts pass/fail directly (already reviewed by
// Micro independently before this is transcribed, same trust model as the
// rest of this file). Assay sensitivity is a permanent lab-wide setting
// (sp_settings.endotoxin_assay_sensitivity_eu_per_ml), stamped in
// server-side below rather than accepted from the client, since it isn't
// something entered with each result.
const endotoxinData = z.object({
  verdict: z.enum(["pass", "fail"]),
  method: z.enum(["gel_clot", "kinetic_turbidimetric", "kinetic_chromogenic"]),
  result_value: z.number().nonnegative().nullable().optional(),
  // Set when the reading is below/above the assay's range rather than an
  // exact value (e.g. "<0.05 EU/mL", the common case for a clean result).
  result_comparator: z.enum(["<", ">"]).nullable().optional(),
  unit: z.enum(["EU/mL", "EU/device"]).nullable().optional(),
});

const heavyMetalsData = z.object({
  elements: z.object({
    mercury: z.number().nullable(),
    lead: z.number().nullable(),
    arsenic: z.number().nullable(),
    cadmium: z.number().nullable(),
  }),
  unit: z.string().min(1).max(32),
  lab_name: z.string().max(255).optional().nullable(),
  report_reference: z.string().max(255).optional().nullable(),
});

export const saveNonchromResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.discriminatedUnion("test_type", [
      z.object({ test_type: z.literal("sterility"), testId: z.string().uuid(), data: sterilityData }),
      z.object({ test_type: z.literal("endotoxin"), testId: z.string().uuid(), data: endotoxinData }),
      z.object({ test_type: z.literal("heavy_metals"), testId: z.string().uuid(), data: heavyMetalsData }),
    ]).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Sterility's pass/fail is derived server-side rather than trusted from
    // the client, same spirit as purityVerdict being computed, not stored --
    // fails if either tube shows growth. Endotoxin's verdict is the
    // analyst's own direct assertion (see endotoxinData comment above); the
    // only thing stamped in here is the assay sensitivity snapshot, read
    // fresh from the permanent setting rather than trusted from the client.
    let payload: object = data.data;
    if (data.test_type === "endotoxin") {
      const { data: settings } = await supabase.from("sp_settings").select("endotoxin_assay_sensitivity_eu_per_ml").eq("id", true).maybeSingle();
      payload = { ...data.data, assay_sensitivity_eu_per_ml: settings?.endotoxin_assay_sensitivity_eu_per_ml ?? null };
    } else if (data.test_type === "sterility") {
      payload = { ...data.data, verdict: data.data.ftm_result === "turbid" || data.data.tsb_result === "turbid" ? "fail" : "pass" };
    }
    const { data: row, error } = await supabase.from("nonchrom_results").insert({
      test_id: data.testId, test_type: data.test_type, data: payload as never, analyst_id: userId,
    }).select().single();
    if (error) throw error;

    // The vial/plate physically comes out of the incubator the moment its
    // result is read out — auto-release rather than a separate manual
    // "remove" click. Best-effort: a release hiccup must never fail an
    // already-saved result.
    try {
      const { data: test } = await supabase.from("tests").select("sample_id").eq("id", data.testId).maybeSingle();
      if (test) await releaseSlotForSample(supabase, test.sample_id, "incubator", data.testId);
    } catch (e) {
      console.error(`saveNonchromResult: incubator release failed for test ${data.testId}`, e);
    }

    return row;
  });

export const listNonchromResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testIds: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.testIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("nonchrom_results").select("*").in("test_id", data.testIds)
      .order("analysis_date", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

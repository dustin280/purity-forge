import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { releaseSampleFromInstrument } from "@/lib/run-lists/vial-release.functions";

export const updateTestSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      testId: z.string().uuid(),
      spec_min: z.number().min(0).max(100).nullable(),
      spec_max: z.number().min(0).max(100).nullable(),
    }).refine(v => v.spec_min == null || v.spec_max == null || v.spec_min <= v.spec_max, {
      message: "spec_min must be less than or equal to spec_max",
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("tests").update({
      spec_min: data.spec_min, spec_max: data.spec_max,
    }).eq("id", data.testId);
    if (error) throw error;
    return { ok: true };
  });

export const listSamples = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Batch-created samples (CoC intake) can share the same created_at
    // down to the millisecond — without a tiebreaker Postgres doesn't
    // guarantee a stable order for those ties, so a plain refetch (e.g.
    // after toggling a prep-flag checkbox) can come back in a different
    // order and look like the list randomly reshuffled.
    const { data, error } = await context.supabase
      .from("samples").select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (error) throw error;
    return data;
  });

const sampleInput = z.object({
  batch_id: z.string().min(1).max(64),
  client_id: z.string().uuid(),
  project: z.string().max(255).optional().nullable(),
  receipt_date: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  parameters: z.array(z.string().min(1).max(128)).max(200).optional().default([]),
});

export const createSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sampleInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { client_id, ...rest } = data;
    const { data: client, error: clientErr } = await supabase
      .from("clients").select("company_name").eq("id", client_id).maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) throw new Error("Selected client not found");

    const { data: sample, error } = await supabase.from("samples").insert({
      ...rest, client_id, client: client.company_name, created_by: userId,
    }).select().single();
    if (error) throw error;
    await supabase.from("tests").insert({
      sample_id: sample.id, method_name: "Peptide Purity HPLC-DAD",
      instrument: "Agilent 1290 DAD", assigned_tech: userId,
    });
    return sample;
  });

export const getSampleDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: sample, error } = await supabase.from("samples").select("*").eq("batch_id", data.batchId).maybeSingle();
    if (error) throw error;
    if (!sample) throw new Error("Sample not found");
    const { data: tests } = await supabase.from("tests").select("*").eq("sample_id", sample.id);
    const testIds = (tests ?? []).map(t => t.id);
    const results = testIds.length
      ? (await supabase.from("results").select("*").in("test_id", testIds)).data ?? []
      : [];
    const userIds = Array.from(new Set(
      results.flatMap(r => [r.analyst_id, r.reviewer_id]).filter((id): id is string => !!id)
    ));
    const profiles = userIds.length
      ? (await supabase.from("profiles").select("id,full_name,first_name,last_name,email,title").in("id", userIds)).data ?? []
      : [];
    return { sample, tests: tests ?? [], results, profiles };
  });

const SAMPLE_STATUSES = [
  "received", "intake_verified", "scheduled", "prep", "in_progress",
  "in_analysis", "on_hold", "reviewed", "complete", "approved", "cancelled",
] as const;
type SampleStatusValue = (typeof SAMPLE_STATUSES)[number];

// Forward-only lifecycle — no skipping steps. Queue-side states
// (scheduled / in_analysis / on_hold) are included so a sample flagged from the
// Analysis Queue can still be moved on. "in_progress → reviewed" and
// "complete → approved" additionally require the sample's latest result to
// have passed the corresponding review/approval gate (see reviewResult /
// approveResult below) before the transition is allowed.
const SAMPLE_STATUS_TRANSITIONS: Record<SampleStatusValue, SampleStatusValue[]> = {
  received: ["intake_verified", "cancelled"],
  intake_verified: ["scheduled", "prep", "cancelled"],
  scheduled: ["prep", "on_hold", "cancelled"],
  prep: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["in_analysis", "reviewed", "on_hold"],
  in_analysis: ["reviewed", "on_hold"],
  on_hold: ["prep", "in_progress", "cancelled"],
  // "approved" is offered directly alongside "complete" so the simplified
  // detail-page UI can merge them into one "Complete" action (they display
  // identically — see DISPLAY_STATUS_MAP in lims-utils.ts) without needing
  // a separate manual "complete" click first.
  reviewed: ["complete", "approved"],
  complete: ["approved"],
  approved: [],
  cancelled: ["received"],
};

export const updateSampleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      status: z.enum(SAMPLE_STATUSES),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: sample, error: sampleErr } = await supabase
      .from("samples").select("status").eq("id", data.sampleId).maybeSingle();
    if (sampleErr) throw sampleErr;
    if (!sample) throw new Error("Sample not found");

    const currentStatus = sample.status as SampleStatusValue;
    const allowedNext = SAMPLE_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowedNext.includes(data.status)) {
      throw new Error(`Cannot move sample from "${currentStatus}" to "${data.status}"`);
    }

    if (data.status === "reviewed" || data.status === "approved") {
      const { data: tests } = await supabase.from("tests").select("id").eq("sample_id", data.sampleId);
      const testIds = (tests ?? []).map(t => t.id);
      const { data: latestResult } = testIds.length
        ? await supabase.from("results").select("reviewed_at,approved_at")
            .in("test_id", testIds).order("analysis_date", { ascending: false }).limit(1).maybeSingle()
        : { data: null };

      if (data.status === "reviewed" && !latestResult?.reviewed_at) {
        throw new Error("The latest result must be reviewed before the sample can move to \"reviewed\"");
      }
      if (data.status === "approved" && !latestResult?.approved_at) {
        throw new Error("The latest result must be approved before the sample can move to \"approved\"");
      }
    }

    const { error } = await supabase.from("samples").update({ status: data.status }).eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: `status_change:${data.status}`, table_name: "samples",
      record_id: data.sampleId, changed_by: userId,
      diff: { status: data.status },
    });
    // Completing a sample frees its instrument vial position automatically
    // -- no separate "remove from instrument" click needed.
    if (data.status === "approved") {
      await releaseSampleFromInstrument(supabase, data.sampleId);
    }
    return { ok: true };
  });

const peakSchema = z.object({
  peak_id: z.string(), rt: z.number(), area: z.number(),
  area_pct: z.number(), identity: z.string().optional(), sn: z.number().optional(),
  amount_per_vial_mg: z.number().optional().nullable(),
  percent_label_claim: z.number().optional().nullable(),
});

export const saveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      testId: z.string().uuid(),
      purity_percentage: z.number().min(0).max(100),
      peaks: z.array(peakSchema).max(200),
      raw_data_file_path: z.string().max(1000).optional().nullable(),
      // Only set when a Drive-imported report supplied its own "Analysis
      // date:" — omitted (not null) for manual paste so the results table's
      // own default (save time) applies, same as before this field existed.
      analysis_date: z.string().optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.from("results").insert({
      test_id: data.testId,
      purity_percentage: data.purity_percentage,
      peak_details: data.peaks,
      raw_data_file_path: data.raw_data_file_path ?? null,
      analyst_id: userId,
      analysis_date: data.analysis_date ?? undefined,
    }).select().single();
    if (error) throw error;
    return res;
  });

export const reviewResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: result, error: fetchErr } = await supabase
      .from("results").select("analyst_id").eq("id", data.resultId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!result) throw new Error("Result not found");
    if (result.analyst_id === userId) throw new Error("You cannot review your own result");

    const { error } = await supabase.from("results").update({
      reviewer_id: userId, reviewed_at: new Date().toISOString(),
    }).eq("id", data.resultId);
    if (error) throw error;
    return { ok: true };
  });

export const approveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: result, error: fetchErr } = await supabase
      .from("results").select("reviewed_at").eq("id", data.resultId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!result) throw new Error("Result not found");
    if (!result.reviewed_at) throw new Error("Result must be reviewed before it can be approved");

    const { error } = await supabase.from("results").update({
      approved_at: new Date().toISOString(),
    }).eq("id", data.resultId);
    if (error) throw error;
    return { ok: true };
  });
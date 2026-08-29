import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { releaseSampleFromInstrument } from "@/lib/run-lists/vial-release.functions";
import { provisionTestsForSample } from "@/lib/lims/test-provisioning";

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
    await provisionTestsForSample(supabase, sample, data.parameters, userId, data.receipt_date);
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
    const nonchromResults = testIds.length
      ? (await supabase.from("nonchrom_results").select("*").in("test_id", testIds).order("analysis_date", { ascending: false })).data ?? []
      : [];
    const nonchromAttachments = testIds.length
      ? (await supabase.from("nonchrom_test_attachments").select("*").in("test_id", testIds).order("uploaded_at", { ascending: false })).data ?? []
      : [];
    const userIds = Array.from(new Set(
      [...results, ...nonchromResults]
        .flatMap(r => [r.analyst_id, r.reviewer_id])
        .concat(sample.purity_waived_by)
        .filter((id): id is string => !!id)
    ));
    const profiles = userIds.length
      ? (await supabase.from("profiles").select("id,full_name,first_name,last_name,email,title").in("id", userIds)).data ?? []
      : [];
    return { sample, tests: tests ?? [], results, profiles, nonchromResults, nonchromAttachments };
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

/**
 * Core of updateSampleStatus, pulled out so reviewResult/approveResult can
 * drive the same transition (validation, gate check, audit log, vial
 * release) as a same-action follow-through instead of leaving it as a
 * separate manual click in the header — reviewing/approving a result is
 * the actual decision; advancing the sample's own status bucket to match
 * has no judgment left in it once that decision is made. Callers that want
 * this to happen automatically should catch and swallow failures (e.g. a
 * multi-test sample where another test isn't done yet) rather than let a
 * transition that isn't ready block the review/approval that already
 * succeeded — the header's manual buttons remain the fallback either way.
 */
export async function transitionSampleStatus(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  sampleId: string,
  status: SampleStatusValue,
): Promise<void> {
  const { data: sample, error: sampleErr } = await supabase
    .from("samples").select("status, purity_waived").eq("id", sampleId).maybeSingle();
  if (sampleErr) throw sampleErr;
  if (!sample) throw new Error("Sample not found");

  const currentStatus = sample.status as SampleStatusValue;
  const allowedNext = SAMPLE_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowedNext.includes(status)) {
    throw new Error(`Cannot move sample from "${currentStatus}" to "${status}"`);
  }

  // A purity-waived sample (referee-lab work with no purity requested at
  // all) has no results row to check against — skip the gate entirely.
  if ((status === "reviewed" || status === "approved") && !sample.purity_waived) {
    const { data: tests } = await supabase.from("tests").select("id").eq("sample_id", sampleId);
    const testIds = (tests ?? []).map(t => t.id);
    const { data: latestResult } = testIds.length
      ? await supabase.from("results").select("reviewed_at,approved_at")
          .in("test_id", testIds).order("analysis_date", { ascending: false }).limit(1).maybeSingle()
      : { data: null };

    if (status === "reviewed" && !latestResult?.reviewed_at) {
      throw new Error("The latest result must be reviewed before the sample can move to \"reviewed\"");
    }
    if (status === "approved" && !latestResult?.approved_at) {
      throw new Error("The latest result must be approved before the sample can move to \"approved\"");
    }
  }

  const { error } = await supabase.from("samples").update({ status }).eq("id", sampleId);
  if (error) throw error;
  await supabase.from("audit_log").insert({
    action: `status_change:${status}`, table_name: "samples",
    record_id: sampleId, changed_by: userId,
    diff: { status },
  });
  // Completing a sample frees its instrument vial position automatically
  // -- no separate "remove from instrument" click needed.
  if (status === "approved") {
    await releaseSampleFromInstrument(supabase, sampleId);
  }
}

export const updateSampleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      status: z.enum(SAMPLE_STATUSES),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    await transitionSampleStatus(context.supabase, context.userId, data.sampleId, data.status);
    return { ok: true };
  });

export const updateSampleAppearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sampleId: z.string().uuid(), physical_description: z.string().max(2000).nullable() }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prior, error: readErr } = await supabase
      .from("samples").select("physical_description").eq("id", data.sampleId).single();
    if (readErr) throw readErr;
    const { error } = await supabase.from("samples")
      .update({ physical_description: data.physical_description }).eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: "appearance_updated",
      table_name: "samples", record_id: data.sampleId, changed_by: userId,
      diff: { physical_description: { from: prior?.physical_description ?? null, to: data.physical_description } },
    });
    return { ok: true };
  });

/**
 * Corrects the descriptive fields of an already-received sample.
 *
 * Everything here is enterable at intake, and until now a mistake made there
 * was permanent from the UI's point of view -- picking the wrong client on a
 * vial left no way to fix it short of a hand-written SQL update.
 *
 * `scope: "receipt"` applies the change to every vial on the same chain of
 * custody. Client is a fact about the shipment, not about one vial, so a
 * per-vial-only correction is how a single receipt ends up with three
 * spellings of the same company across its vials. Status, results and ids
 * are untouched -- this fixes labels, not the sample's lifecycle.
 */
export const updateSampleInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      scope: z.enum(["vial", "receipt"]).default("vial"),
      client_id: z.string().uuid().nullable().optional(),
      project: z.string().max(255).nullable().optional(),
      lot: z.string().max(255).nullable().optional(),
      notes: z.string().max(4000).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prior, error: readErr } = await supabase
      .from("samples")
      .select("id, batch_id, coc_id, client, client_id, project, lot, notes")
      .eq("id", data.sampleId)
      .single();
    if (readErr) throw readErr;

    const patch: {
      client?: string; client_id?: string | null;
      project?: string | null; lot?: string | null; notes?: string | null;
    } = {};
    if (data.client_id !== undefined) {
      if (data.client_id === null) {
        patch.client_id = null;
      } else {
        // Denormalised `client` name has to move with the id or the two
        // disagree -- exactly the drift this function exists to clean up.
        const { data: client, error: cErr } = await supabase
          .from("clients").select("id, company_name").eq("id", data.client_id).single();
        if (cErr || !client) throw new Error("Client not found");
        patch.client_id = client.id;
        patch.client = client.company_name;
      }
    }
    if (data.project !== undefined) patch.project = data.project;
    if (data.lot !== undefined) patch.lot = data.lot;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true, updated: 0 };

    // `lot` is the partner's own per-vial string (…-EN, …-ST) and is the key
    // their export looks up by, so it is never spread across a receipt.
    const receiptWide = { ...patch };
    delete receiptWide.lot;

    let updated = 1;
    const { error } = await supabase.from("samples").update(patch).eq("id", data.sampleId);
    if (error) throw error;

    if (data.scope === "receipt" && prior.coc_id && Object.keys(receiptWide).length > 0) {
      const { data: siblings, error: sibErr } = await supabase
        .from("samples").update(receiptWide)
        .eq("coc_id", prior.coc_id).neq("id", data.sampleId).select("id");
      if (sibErr) throw sibErr;
      updated += siblings?.length ?? 0;

      // Keep the receipt header in step, so re-opening the CoC doesn't show
      // the name we just corrected away from.
      if (patch.client !== undefined) {
        const { data: coc } = await supabase
          .from("chain_of_custody_records").select("data").eq("id", prior.coc_id).maybeSingle();
        if (coc?.data && typeof coc.data === "object") {
          await supabase.from("chain_of_custody_records")
            .update({ data: { ...(coc.data as Record<string, unknown>), client_company: patch.client, client_id: patch.client_id } })
            .eq("id", prior.coc_id);
        }
      }
    }

    await supabase.from("audit_log").insert({
      action: "sample_info_updated",
      table_name: "samples", record_id: data.sampleId, changed_by: userId,
      diff: {
        scope: data.scope,
        vials_updated: updated,
        from: { client: prior.client, client_id: prior.client_id, project: prior.project, lot: prior.lot, notes: prior.notes },
        to: patch,
      },
    });
    return { ok: true, updated };
  });

export const setPurityWaived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sampleId: z.string().uuid(), waived: z.boolean() }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("samples").update({
      purity_waived: data.waived,
      purity_waived_at: data.waived ? new Date().toISOString() : null,
      purity_waived_by: data.waived ? userId : null,
    }).eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: data.waived ? "purity_waived" : "purity_waived:undo",
      table_name: "samples", record_id: data.sampleId, changed_by: userId,
      diff: { purity_waived: data.waived },
    });
    return { ok: true };
  });

const calibrationDataSchema = z.object({
  calibration_update: z.string().nullable(),
  compound: z.string().nullable(),
  exp_rt: z.number().nullable(),
  residual_std: z.number().nullable(),
  r: z.number().nullable(),
  r_squared: z.number().nullable(),
  formula: z.string().nullable(),
  a: z.number().nullable(),
  b: z.number().nullable(),
  c: z.number().nullable(),
  d: z.number().nullable(),
  scaled_label: z.string().nullable(),
  scaled_type: z.string().nullable(),
});

const peakSchema = z.object({
  peak_id: z.string(), rt: z.number(), area: z.number().nullable(),
  area_pct: z.number(), identity: z.string().optional(), sn: z.number().optional(),
  amount_per_vial_mg: z.number().optional().nullable(),
  percent_label_claim: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  rf: z.number().optional().nullable(),
  concentration_mg: z.number().optional().nullable(),
  peak_purity: z.number().optional().nullable(),
  peak_purity_passed: z.boolean().optional().nullable(),
  uv_match: z.number().optional().nullable(),
  wavelength_nm: z.number().optional().nullable(),
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
      // data: URI sourced from the report's sibling "<report>.chromatogram.png"
      // in Drive (see findChromatogramImage) — null for manual paste or when
      // no converted chromatogram exists yet.
      chromatogram_image: z.string().max(2_000_000).optional().nullable(),
      // data: URI sourced from the report's sibling "<report>.calibration.png"
      // — the calibration curve chart, alongside its fit stats. Null when
      // the report has no "Calibration Update" block (older report
      // templates) or the sibling image hasn't been converted yet.
      calibration_image: z.string().max(2_000_000).optional().nullable(),
      calibration_data: calibrationDataSchema.optional().nullable(),
      // Full per-compound calibration curve set for blend reports (SUMMIT
      // etc.) -- calibration_image/calibration_data above stay populated
      // with the first/primary curve for backward compatibility (partner
      // export API, older UI code); this carries all of them.
      calibration_curves: z.array(z.object({
        compound: z.string().nullable(),
        image: z.string().max(2_000_000).nullable(),
        data: calibrationDataSchema.nullable(),
      })).optional().nullable(),
      // Instrument-sourced values — no manual-entry UI supplies these yet,
      // but the schema accepts them the moment a real source (report
      // template or ACAML) is wired in.
      uv_conf_match: z.number().min(0).max(1000).optional().nullable(),
      wavelength_nm: z.number().positive().optional().nullable(),
      // Report-header fields with no dedicated column (data file, operator,
      // instrument, injection volume, location, method names, etc.) — null
      // for manual paste or when the parser found none.
      report_metadata: z.record(z.string(), z.string()).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      purity_percentage: data.purity_percentage,
      peak_details: data.peaks,
      raw_data_file_path: data.raw_data_file_path ?? null,
      analysis_date: data.analysis_date ?? undefined,
      chromatogram_image: data.chromatogram_image ?? null,
      calibration_image: data.calibration_image ?? null,
      calibration_data: data.calibration_data ?? null,
      calibration_curves: data.calibration_curves ?? null,
      uv_conf_match: data.uv_conf_match ?? null,
      wavelength_nm: data.wavelength_nm ?? null,
      report_metadata: data.report_metadata ?? null,
    };
    // Re-submitting for a test that already has a result updates it in
    // place instead of appending a duplicate row — the common case is
    // backfilling newly-available data (e.g. a calibration curve the
    // converter didn't produce yet at first-import time) onto an
    // already-saved/reviewed result, not re-doing the analysis. Review/
    // approval state and who originally analyzed it are left untouched.
    const { data: existing } = await supabase.from("results")
      .select("id").eq("test_id", data.testId)
      .order("analysis_date", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      const { data: res, error } = await supabase.from("results")
        .update(payload).eq("id", existing.id).select().single();
      if (error) throw error;
      return res;
    }
    const { data: res, error } = await supabase.from("results")
      .insert({ ...payload, test_id: data.testId, analyst_id: userId }).select().single();
    if (error) throw error;
    return res;
  });

// reviewResult/approveResult both need the sample a result belongs to
// (results -> tests -> samples has no shortcut FK) purely to attempt the
// matching sample-status cascade below.
async function sampleIdForResult(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  resultId: string,
): Promise<string | null> {
  const { data: result } = await supabase.from("results").select("test_id").eq("id", resultId).maybeSingle();
  if (!result?.test_id) return null;
  const { data: test } = await supabase.from("tests").select("sample_id").eq("id", result.test_id).maybeSingle();
  return test?.sample_id ?? null;
}

export const reviewResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [{ data: result, error: fetchErr }, { data: config }] = await Promise.all([
      supabase.from("results").select("analyst_id").eq("id", data.resultId).maybeSingle(),
      supabase.from("review_config").select("allow_self_review").eq("id", true).maybeSingle(),
    ]);
    if (fetchErr) throw fetchErr;
    if (!result) throw new Error("Result not found");
    if (result.analyst_id === userId && !config?.allow_self_review) throw new Error("You cannot review your own result");

    // Review is the one real decision left once a result is entered —
    // approve alongside it in the same call rather than making the analyst
    // come back for a second, purely mechanical click. approveResult stays
    // available as its own action (e.g. re-running this on an older result
    // that was reviewed before this existed), it's just redundant in the
    // normal one-click path since canApprove goes false the moment
    // approved_at is set here.
    const now = new Date().toISOString();
    const { error } = await supabase.from("results").update({
      reviewer_id: userId, reviewed_at: now, approved_at: now,
    }).eq("id", data.resultId);
    if (error) throw error;

    // Best-effort: walk the sample all the way to "approved" (also frees
    // its instrument vial position) so reviewing is the one action that
    // finishes it. Each step is attempted independently so a sample not
    // currently eligible for one step (already past it, another test still
    // outstanding, etc.) doesn't block the other — the header's manual
    // "Mark In Review"/"Complete" buttons remain the fallback either way,
    // this never blocks the review that already succeeded above.
    const sampleId = await sampleIdForResult(supabase, data.resultId);
    if (sampleId) {
      try { await transitionSampleStatus(supabase, userId, sampleId, "reviewed"); } catch { /* already past this, or blocked */ }
      try { await transitionSampleStatus(supabase, userId, sampleId, "approved"); } catch { /* fallback to manual */ }
    }
    return { ok: true };
  });

export const approveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: result, error: fetchErr } = await supabase
      .from("results").select("reviewed_at").eq("id", data.resultId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!result) throw new Error("Result not found");
    if (!result.reviewed_at) throw new Error("Result must be reviewed before it can be approved");

    const { error } = await supabase.from("results").update({
      approved_at: new Date().toISOString(),
    }).eq("id", data.resultId);
    if (error) throw error;

    // Same best-effort cascade as reviewResult above, straight to
    // "approved" (also releases the sample's instrument vial position).
    const sampleId = await sampleIdForResult(supabase, data.resultId);
    if (sampleId) {
      try { await transitionSampleStatus(supabase, userId, sampleId, "approved"); } catch { /* fallback to manual */ }
    }
    return { ok: true };
  });
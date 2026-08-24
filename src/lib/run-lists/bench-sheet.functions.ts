/**
 * Digital bench sheet ("Record of Analysis") for a run list — documents
 * the physical execution of a batch run. Deliberately does NOT re-capture
 * prep data: each row's prep summary is composed from whichever existing
 * record already covers it (sp_preparation_records via run_list_items'
 * existing sp_preparation_record_id link, or the sample's sterility test's
 * analysis_batches entry for sterility samples with no HPLC prep) —
 * read-only here, never written to.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  role: "admin" | "reviewer",
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
  if (error) throw error;
  return data === true;
}

export interface BenchSheetRow {
  itemId: string;
  rowNo: number;
  sampleType: string;
  batchId: string | null;
  compound: string | null;
  client: string | null;
  vial: number | null;
  comment: string | null;
  prepSummary: string | null;
}

export interface BenchSheet {
  id: string;
  document_number: string;
  run_list_id: string;
  performed_by: string | null;
  performed_at: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
  narrative: string | null;
  deviation_flag: boolean;
  deviation_notes: string | null;
  status: "in_progress" | "completed" | "reviewed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
}

/** Lightweight existence+status check — used for status badges (the run
 * list detail page, the Bench Sheets list page) without paying for the
 * full row/prep composition getBenchSheet does. */
export const listBenchSheetStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("run_list_bench_sheets").select("run_list_id, status, performed_at, reviewed_at");
    if (error) throw error;
    return data ?? [];
  });

export const getBenchSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runListId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: list, error: listErr } = await context.supabase
      .from("run_lists").select("id, name, instrument_id, method_name, created_at").eq("id", data.runListId).maybeSingle();
    if (listErr) throw listErr;
    if (!list) throw new Error("Run list not found");

    const { data: sheet, error: sheetErr } = await context.supabase
      .from("run_list_bench_sheets").select("*").eq("run_list_id", data.runListId).maybeSingle();
    if (sheetErr) throw sheetErr;

    const { data: items, error: itemsErr } = await context.supabase
      .from("run_list_items")
      .select("id, row_no, sample_type, vial, comment, sample_id, sp_preparation_record_id")
      .eq("run_list_id", data.runListId)
      .order("row_no");
    if (itemsErr) throw itemsErr;

    const sampleIds = (items ?? []).map((i) => i.sample_id).filter((v): v is string => !!v);
    const prepRecordIds = (items ?? []).map((i) => i.sp_preparation_record_id).filter((v): v is string => !!v);

    // Sterility rows have no sp_preparation_record_id (that's HPLC-specific)
    // — their prep summary instead comes from whichever analysis_batch
    // their sterility test belongs to (see analysis-batches.functions.ts).
    const [samplesRes, prepsRes, sterilityTestsRes] = await Promise.all([
      sampleIds.length
        ? context.supabase.from("samples").select("id, batch_id, compound, client").in("id", sampleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; batch_id: string; compound: string | null; client: string }> }),
      prepRecordIds.length
        ? context.supabase.from("sp_preparation_records").select("id, prep_number, status, total_dilution_factor")
        .in("id", prepRecordIds)
        : Promise.resolve({ data: [] as Array<{ id: string; prep_number: string; status: string; total_dilution_factor: number | null }> }),
      sampleIds.length
        ? context.supabase.from("tests").select("id, sample_id").eq("test_type", "sterility").in("sample_id", sampleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; sample_id: string }> }),
    ]);

    const sterilityTestIds = (sterilityTestsRes.data ?? []).map((t) => t.id);
    const { data: batchItems } = sterilityTestIds.length
      ? await context.supabase.from("analysis_batch_items").select("test_id, batch_id").in("test_id", sterilityTestIds)
      : { data: [] as Array<{ test_id: string; batch_id: string }> };
    const batchIds = (batchItems ?? []).map((b) => b.batch_id);
    const { data: batches } = batchIds.length
      ? await context.supabase.from("analysis_batches").select("id, batch_number, details, incubation_started_at").in("id", batchIds)
      : { data: [] as Array<{ id: string; batch_number: string; details: { ftm_lot_number?: string | null; tsb_lot_number?: string | null }; incubation_started_at: string | null }> };
    const batchById = new Map((batches ?? []).map((b) => [b.id, b]));
    const batchIdBySterilityTest = new Map((batchItems ?? []).map((b) => [b.test_id, b.batch_id]));
    const sterilityTestBySample = new Map((sterilityTestsRes.data ?? []).map((t) => [t.sample_id, t.id]));

    const sampleById = new Map((samplesRes.data ?? []).map((s) => [s.id, s]));
    const prepById = new Map((prepsRes.data ?? []).map((p) => [p.id, p]));

    const rows: BenchSheetRow[] = (items ?? []).map((it) => {
      const sample = it.sample_id ? sampleById.get(it.sample_id) : null;
      const prep = it.sp_preparation_record_id ? prepById.get(it.sp_preparation_record_id) : null;
      const sterilityTestId = it.sample_id ? sterilityTestBySample.get(it.sample_id) : undefined;
      const sterilityBatch = sterilityTestId ? batchById.get(batchIdBySterilityTest.get(sterilityTestId) ?? "") : null;
      const sterilityDetails = sterilityBatch?.details as { ftm_lot_number?: string | null; tsb_lot_number?: string | null } | undefined;
      const prepSummary = prep
        ? `Prep ${prep.prep_number} (${prep.status})${prep.total_dilution_factor ? ` · DF ${prep.total_dilution_factor}x` : ""}`
        : sterilityBatch
          ? `Batch ${sterilityBatch.batch_number} — FTM lot ${sterilityDetails?.ftm_lot_number ?? "—"} / TSB lot ${sterilityDetails?.tsb_lot_number ?? "—"}`
          : null;
      return {
        itemId: it.id,
        rowNo: it.row_no,
        sampleType: it.sample_type,
        batchId: sample?.batch_id ?? null,
        compound: sample?.compound ?? null,
        client: sample?.client ?? null,
        vial: it.vial,
        comment: it.comment,
        prepSummary,
      };
    });

    // uuid -> profile, same precedence resolution as profileDisplayName
    // (src/hooks/use-auth.tsx): client resolves first+last, then full_name,
    // then email. Resolved client-side, same convention as getSampleDetail.
    const s = sheet as BenchSheet | null;
    const profileIds = [s?.performed_by, s?.reviewed_by].filter((v): v is string => !!v);
    const { data: profiles } = profileIds.length
      ? await context.supabase.from("profiles").select("id,full_name,first_name,last_name,email,title").in("id", profileIds)
      : { data: [] as Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; title: string | null }> };

    return { list, sheet: s, rows, profiles: profiles ?? [] };
  });

export const startBenchSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runListId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const rowId = crypto.randomUUID();
    const { data: docNumber, error: docErr } = await context.supabase
      .rpc("register_document", { p_code: "BNCH", p_source_table: "run_list_bench_sheets", p_source_id: rowId, p_created_by: context.userId });
    if (docErr) throw docErr;

    const { data: row, error } = await context.supabase
      .from("run_list_bench_sheets")
      .insert({
        id: rowId,
        document_number: docNumber,
        run_list_id: data.runListId,
        performed_by: context.userId,
        performed_at: now,
        run_started_at: now,
        status: "in_progress",
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateBenchSheetNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    runListId: z.string().uuid(),
    narrative: z.string().max(10_000).optional().nullable(),
    deviationFlag: z.boolean().optional(),
    deviationNotes: z.string().max(4_000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: sheet } = await context.supabase
      .from("run_list_bench_sheets").select("status").eq("run_list_id", data.runListId).maybeSingle();
    if (!sheet) throw new Error("Bench sheet not started yet");
    if (sheet.status === "reviewed") throw new Error("Bench sheet already reviewed — locked");
    const { error } = await context.supabase
      .from("run_list_bench_sheets")
      .update({
        ...(data.narrative !== undefined ? { narrative: data.narrative } : {}),
        ...(data.deviationFlag !== undefined ? { deviation_flag: data.deviationFlag } : {}),
        ...(data.deviationNotes !== undefined ? { deviation_notes: data.deviationNotes } : {}),
      })
      .eq("run_list_id", data.runListId);
    if (error) throw error;
    return { ok: true };
  });

export const updateRunListItemComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    itemId: z.string().uuid(),
    comment: z.string().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("run_list_items").update({ comment: data.comment ?? null }).eq("id", data.itemId);
    if (error) throw error;
    return { ok: true };
  });

export const completeBenchSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runListId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("run_list_bench_sheets")
      .update({ run_completed_at: new Date().toISOString(), status: "completed" })
      .eq("run_list_id", data.runListId)
      .eq("status", "in_progress");
    if (error) throw error;
    return { ok: true };
  });

export const reviewBenchSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    runListId: z.string().uuid(),
    comment: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await assertRole(context.supabase, context.userId, "admin");
    const reviewer = admin || (await assertRole(context.supabase, context.userId, "reviewer"));
    if (!reviewer) throw new Error("Only reviewers or admins can review bench sheets.");
    const { error } = await context.supabase
      .from("run_list_bench_sheets")
      .update({
        status: "reviewed",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_comment: data.comment ?? null,
      })
      .eq("run_list_id", data.runListId)
      .eq("status", "completed");
    if (error) throw error;
    return { ok: true };
  });

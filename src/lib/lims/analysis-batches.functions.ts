/**
 * Analysis Batches — the batch-level "Record of Analysis" for non-HPLC
 * testing (sterility to start). An analyst selects every sample due for a
 * given test from a queue, preps/inoculates them together, and the whole
 * event (media lots, incubator(s) + temperatures, inoculation amount, the
 * exact moment the clock started) is captured as one record — pulling live
 * from material_receipts (lots) and storage_units (incubators) rather than
 * re-typing anything.
 *
 * Generic across test types by design: `test_type` is a free-text
 * discriminator (only "sterility" implemented today) and `details` is a
 * jsonb payload whose shape is per-type, same convention already used for
 * nonchrom_results.data (see nonchrom-results.functions.ts) — adding a new
 * non-HPLC test type later means a new details shape + a new form
 * component, reusing everything else here (queue, batch header, sign-off,
 * PDF, notifications).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assignSlotFromUnitList } from "@/lib/lims/storage-assignment.functions";

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

const BATCH_NUMBER_PREFIX: Record<string, string> = { sterility: "STB" };

export interface MediaLot {
  receiptId: string;
  lotNumber: string;
  materialName: string;
  expiryDate: string | null;
}

const MEDIA_NAME_PATTERNS: Record<"FTM" | "TSB", string[]> = {
  FTM: ["%FTM%", "%Fluid Thioglycollate%", "%Thioglycollate%"],
  TSB: ["%TSB%", "%Tryptic Soy Broth%", "%Tryptic Soy%"],
};

export const listMediaLots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mediaName: z.enum(["FTM", "TSB"]) }).parse(d))
  .handler(async ({ context, data }): Promise<MediaLot[]> => {
    const patterns = MEDIA_NAME_PATTERNS[data.mediaName];
    const orClause = patterns.map((p) => `material_name.ilike.${p}`).join(",");
    const { data: rows, error } = await context.supabase
      .from("material_receipts")
      .select("id, material_name, manufacturer_lot, internal_lot, expiry_date")
      .or(orClause)
      .eq("quarantine_status", "released")
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const now = Date.now();
    return (rows ?? [])
      .filter((r) => !r.expiry_date || new Date(r.expiry_date).getTime() > now)
      .map((r) => ({
        receiptId: r.id,
        lotNumber: r.manufacturer_lot ?? r.internal_lot ?? "(no lot #)",
        materialName: r.material_name,
        expiryDate: r.expiry_date,
      }));
  });

export interface AnalysisBatchRow {
  itemId: string;
  testId: string;
  sampleId: string;
  batchId: string | null;
  compound: string | null;
  client: string | null;
  slotLabel: string | null;
  day3Status: string;
  day3CheckedAt: string | null;
  day3Notes: string | null;
  day3Due: boolean;
  day7Status: string;
  day7CheckedAt: string | null;
  day7Notes: string | null;
  day7Due: boolean;
}

export interface QueueItem {
  testId: string;
  sampleId: string;
  batchId: string;
  compound: string | null;
  client: string;
}

export const listBatchQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testType: z.string() }).parse(d))
  .handler(async ({ context, data }): Promise<QueueItem[]> => {
    const { data: tests, error } = await context.supabase
      .from("tests").select("id, sample_id")
      .eq("test_type", data.testType as "purity" | "sterility" | "endotoxin" | "heavy_metals");
    if (error) throw error;
    if (!tests?.length) return [];

    const { data: batched } = await context.supabase
      .from("analysis_batch_items").select("test_id").in("test_id", tests.map((t) => t.id));
    const batchedIds = new Set((batched ?? []).map((b) => b.test_id));
    const unbatched = tests.filter((t) => !batchedIds.has(t.id));
    if (!unbatched.length) return [];

    const sampleIds = unbatched.map((t) => t.sample_id);
    const { data: samples } = await context.supabase
      .from("samples").select("id, batch_id, compound, client").in("id", sampleIds);
    const sampleById = new Map((samples ?? []).map((s) => [s.id, s]));

    return unbatched.map((t) => {
      const s = sampleById.get(t.sample_id);
      return {
        testId: t.id, sampleId: t.sample_id,
        batchId: s?.batch_id ?? "—", compound: s?.compound ?? null, client: s?.client ?? "",
      };
    });
  });

const sterilityBatchInput = z.object({
  testType: z.literal("sterility"),
  testIds: z.array(z.string().uuid()).min(1).max(200),
  performedAt: z.string().optional(),
  method: z.string().max(255).optional().nullable(),
  ftmReceiptId: z.string().uuid(),
  tsbReceiptId: z.string().uuid(),
  inoculationVolumeMl: z.number().positive().max(50).default(1.0),
  incubators: z.array(z.object({
    unitId: z.string().uuid(),
    temperatureC: z.number().min(-20).max(60).optional().nullable(),
  })).min(1).max(5),
});

export const createAnalysisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sterilityBatchInput.parse(d))
  .handler(async ({ context, data }) => {
    const [ftm, tsb, units] = await Promise.all([
      context.supabase.from("material_receipts").select("id, manufacturer_lot, internal_lot").eq("id", data.ftmReceiptId).maybeSingle(),
      context.supabase.from("material_receipts").select("id, manufacturer_lot, internal_lot").eq("id", data.tsbReceiptId).maybeSingle(),
      context.supabase.from("storage_units").select("id, name").in("id", data.incubators.map((i) => i.unitId)),
    ]);
    if (!ftm.data || !tsb.data) throw new Error("Selected FTM/TSB lot not found");
    const unitById = new Map((units.data ?? []).map((u) => [u.id, u.name]));

    const { data: seq, error: seqErr } = await context.supabase.rpc("next_analysis_batch_seq", { p_test_type: data.testType });
    if (seqErr) throw seqErr;
    const batchNumber = `${BATCH_NUMBER_PREFIX[data.testType] ?? data.testType.toUpperCase()}-${String(seq).padStart(4, "0")}`;

    const details = {
      ftm_receipt_id: ftm.data.id,
      ftm_lot_number: ftm.data.manufacturer_lot ?? ftm.data.internal_lot ?? null,
      tsb_receipt_id: tsb.data.id,
      tsb_lot_number: tsb.data.manufacturer_lot ?? tsb.data.internal_lot ?? null,
      inoculation_volume_ml: data.inoculationVolumeMl,
      incubators: data.incubators.map((i) => ({
        unit_id: i.unitId, unit_name: unitById.get(i.unitId) ?? "—", temperature_c: i.temperatureC ?? null,
      })),
    };

    const { data: batch, error: batchErr } = await context.supabase
      .from("analysis_batches")
      .insert({
        test_type: data.testType,
        batch_number: batchNumber,
        performed_by: context.userId,
        performed_at: data.performedAt ?? new Date().toISOString(),
        method: data.method ?? null,
        details,
        incubation_started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (batchErr) throw batchErr;

    const unitIds = data.incubators.map((i) => i.unitId);
    const failures: Array<{ testId: string; reason: string }> = [];
    for (const testId of data.testIds) {
      const { data: test } = await context.supabase.from("tests").select("sample_id").eq("id", testId).maybeSingle();
      if (!test) { failures.push({ testId, reason: "test not found" }); continue; }
      const placement = await assignSlotFromUnitList(context.supabase, test.sample_id, "incubator", unitIds, testId);
      if (!placement.ok) { failures.push({ testId, reason: placement.reason ?? "assignment failed" }); continue; }
      const { error: itemErr } = await context.supabase.from("analysis_batch_items").insert({
        batch_id: batch.id, test_id: testId, sample_id: test.sample_id, storage_slot_id: placement.storage_slot_id,
      });
      if (itemErr) failures.push({ testId, reason: itemErr.message });
    }

    return { batch, failures };
  });

export const listAnalysisBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testType: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("analysis_batches").select("*").order("created_at", { ascending: false });
    if (data.testType) q = q.eq("test_type", data.testType);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getAnalysisBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: batch, error: batchErr } = await context.supabase
      .from("analysis_batches").select("*").eq("id", data.batchId).maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch) throw new Error("Batch not found");

    const { data: items, error: itemsErr } = await context.supabase
      .from("analysis_batch_items")
      .select("id, test_id, sample_id, storage_slot_id, day3_status, day3_checked_at, day3_notes, day7_status, day7_checked_at, day7_notes")
      .eq("batch_id", data.batchId);
    if (itemsErr) throw itemsErr;

    const sampleIds = (items ?? []).map((i) => i.sample_id);
    const slotIds = (items ?? []).map((i) => i.storage_slot_id).filter((v): v is string => !!v);
    const [samplesRes, slotsRes, settingsRes, profilesRes] = await Promise.all([
      sampleIds.length
        ? context.supabase.from("samples").select("id, batch_id, compound, client").in("id", sampleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; batch_id: string; compound: string | null; client: string }> }),
      slotIds.length
        ? context.supabase.from("storage_slots").select("id, label, storage_units(name)").in("id", slotIds)
        : Promise.resolve({ data: [] as Array<{ id: string; label: string; storage_units: { name: string } | null }> }),
      context.supabase.from("sp_settings").select("sterility_day3_check_day, sterility_day7_check_day, sterility_readout_day").eq("id", true).maybeSingle(),
      (async () => {
        const ids = [batch.performed_by, batch.reviewed_by].filter((v): v is string => !!v);
        if (!ids.length) return { data: [] as Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; title: string | null }> };
        return context.supabase.from("profiles").select("id,full_name,first_name,last_name,email,title").in("id", ids);
      })(),
    ]);
    const sampleById = new Map((samplesRes.data ?? []).map((s) => [s.id, s]));
    const slotById = new Map((slotsRes.data ?? []).map((s) => [s.id, s]));

    const day3Day = settingsRes.data?.sterility_day3_check_day ?? 3;
    const day7Day = settingsRes.data?.sterility_day7_check_day ?? 7;
    const readoutDay = settingsRes.data?.sterility_readout_day ?? 14;
    const dayOfIncubation = batch.incubation_started_at
      ? Math.floor((Date.now() - new Date(batch.incubation_started_at).getTime()) / 86_400_000)
      : 0;
    const readoutDueDate = batch.incubation_started_at
      ? new Date(new Date(batch.incubation_started_at).getTime() + readoutDay * 86_400_000).toISOString()
      : null;

    const rows = (items ?? []).map((it) => {
      const sample = sampleById.get(it.sample_id);
      const slot = it.storage_slot_id ? slotById.get(it.storage_slot_id) : null;
      const unit = slot?.storage_units as unknown as { name: string } | null;
      return {
        itemId: it.id, testId: it.test_id, sampleId: it.sample_id,
        batchId: sample?.batch_id ?? null, compound: sample?.compound ?? null, client: sample?.client ?? null,
        slotLabel: slot ? `${unit?.name ?? "—"} / ${slot.label}` : null,
        day3Status: it.day3_status, day3CheckedAt: it.day3_checked_at, day3Notes: it.day3_notes,
        day3Due: it.day3_status === "pending" && dayOfIncubation >= day3Day,
        day7Status: it.day7_status, day7CheckedAt: it.day7_checked_at, day7Notes: it.day7_notes,
        day7Due: it.day7_status === "pending" && dayOfIncubation >= day7Day,
      };
    });

    return {
      batch,
      rows,
      profiles: profilesRes.data ?? [],
      dayOfIncubation,
      readoutDueDate,
      readoutDue: dayOfIncubation >= readoutDay,
    };
  });

/** Used by the sample Results tab (SterilityBatchStatus) to show which
 * batch a given test belongs to, if any. */
export const getBatchForTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: item } = await context.supabase
      .from("analysis_batch_items")
      .select("id, batch_id, storage_slot_id, day3_status, day7_status")
      .eq("test_id", data.testId).maybeSingle();
    if (!item) return null;
    const { data: batch } = await context.supabase
      .from("analysis_batches").select("id, batch_number, incubation_started_at, status").eq("id", item.batch_id).maybeSingle();
    if (!batch) return null;
    let slotLabel: string | null = null;
    if (item.storage_slot_id) {
      const { data: slot } = await context.supabase
        .from("storage_slots").select("label, storage_units(name)").eq("id", item.storage_slot_id).maybeSingle();
      if (slot) slotLabel = `${(slot.storage_units as unknown as { name: string } | null)?.name ?? "—"} / ${slot.label}`;
    }
    const { data: settings } = await context.supabase
      .from("sp_settings").select("sterility_readout_day").eq("id", true).maybeSingle();
    const readoutDay = settings?.sterility_readout_day ?? 14;
    const dayOfIncubation = batch.incubation_started_at
      ? Math.floor((Date.now() - new Date(batch.incubation_started_at).getTime()) / 86_400_000)
      : 0;
    const readoutDueDate = batch.incubation_started_at
      ? new Date(new Date(batch.incubation_started_at).getTime() + readoutDay * 86_400_000).toISOString()
      : null;
    return {
      batchId: batch.id, batchNumber: batch.batch_number, status: batch.status,
      dayOfIncubation, readoutDueDate, slotLabel,
      day3Status: item.day3_status, day7Status: item.day7_status,
    };
  });

export const recordItemCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    itemId: z.string().uuid(),
    checkpoint: z.enum(["day3", "day7"]),
    result: z.enum(["clear", "turbid"]),
    notes: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const patch = data.checkpoint === "day3"
      ? { day3_status: data.result, day3_checked_at: now, day3_checked_by: context.userId, day3_notes: data.notes ?? null }
      : { day7_status: data.result, day7_checked_at: now, day7_checked_by: context.userId, day7_notes: data.notes ?? null };
    const { error } = await context.supabase
      .from("analysis_batch_items")
      .update(patch)
      .eq("id", data.itemId);
    if (error) throw error;
    return { ok: true };
  });

export const completeAnalysisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("analysis_batches").update({ status: "completed" }).eq("id", data.batchId).eq("status", "in_progress");
    if (error) throw error;
    return { ok: true };
  });

export const reviewAnalysisBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    batchId: z.string().uuid(),
    comment: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await assertRole(context.supabase, context.userId, "admin");
    const reviewer = admin || (await assertRole(context.supabase, context.userId, "reviewer"));
    if (!reviewer) throw new Error("Only reviewers or admins can review analysis batches.");
    const { error } = await context.supabase
      .from("analysis_batches")
      .update({
        status: "reviewed", reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
        review_comment: data.comment ?? null,
      })
      .eq("id", data.batchId).eq("status", "completed");
    if (error) throw error;
    return { ok: true };
  });

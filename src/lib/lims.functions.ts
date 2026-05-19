import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: samplesAll }, { data: recent }, { data: audit }, { data: results }] = await Promise.all([
      supabase.from("samples").select("status"),
      supabase.from("samples").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(15),
      supabase.from("results").select("purity_percentage"),
    ]);
    const counts = { received: 0, in_progress: 0, reviewed: 0, approved: 0 };
    (samplesAll ?? []).forEach((s: { status: string }) => {
      if (s.status in counts) (counts as Record<string, number>)[s.status]++;
    });
    const purities = (results ?? []).map(r => Number(r.purity_percentage)).filter(n => !isNaN(n));
    const avgPurity = purities.length ? purities.reduce((a, b) => a + b, 0) / purities.length : null;
    return { samples: recent ?? [], audit: audit ?? [], counts, avgPurity };
  });

export const listSamples = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("samples").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

const sampleInput = z.object({
  batch_id: z.string().min(1).max(64),
  client: z.string().min(1).max(255),
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
    const { data: sample, error } = await supabase.from("samples").insert({
      ...data, created_by: userId,
    }).select().single();
    if (error) throw error;
    // auto-create default test
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
    return { sample, tests: tests ?? [], results };
  });

export const updateSampleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sampleId: z.string().uuid(),
      status: z.enum(["received", "in_progress", "reviewed", "approved"]),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("samples").update({ status: data.status }).eq("id", data.sampleId);
    if (error) throw error;
    await supabase.from("audit_log").insert({
      action: `status_change:${data.status}`, table_name: "samples",
      record_id: data.sampleId, changed_by: userId,
      diff: { status: data.status },
    });
    return { ok: true };
  });

const peakSchema = z.object({
  peak_id: z.string(), rt: z.number(), area: z.number(),
  area_pct: z.number(), identity: z.string().optional(), sn: z.number().optional(),
});

export const saveResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      testId: z.string().uuid(),
      purity_percentage: z.number().min(0).max(100),
      peaks: z.array(peakSchema).max(200),
      raw_data_file_path: z.string().max(1000).optional().nullable(),
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
    }).select().single();
    if (error) throw error;
    return res;
  });

export const getExportConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("export_config").select("*").limit(1).maybeSingle();
    return data;
  });

export const saveExportConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      webhook_url: z.string().url().or(z.literal("")).nullable().optional(),
      include_lcs: z.boolean(),
      include_ccv: z.boolean(),
      include_method_blank: z.boolean(),
      include_calibration: z.boolean(),
      is_active: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = { ...data, updated_by: userId, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await supabase.from("export_config").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("export_config").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profiles } = await context.supabase.from("profiles").select("*");
    const { data: roles } = await context.supabase.from("user_roles").select("*");
    return { profiles: profiles ?? [], roles: roles ?? [] };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "tech", "reviewer"]),
      grant: z.boolean(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.grant) {
      const { error } = await supabase.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });

export const listParameters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("test_parameters").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(128).trim() }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("test_parameters")
      .insert({ name: data.name, created_by: userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(128).trim().optional(),
      is_active: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("test_parameters").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("test_parameters").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============= Chain of Custody =============

const cocFieldType = z.enum(["text", "textarea", "number", "date", "datetime", "email", "tel"]);

export const listCocFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chain_of_custody_fields").select("*").order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      field_key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores"),
      label: z.string().min(1).max(255).trim(),
      field_type: cocFieldType.default("text"),
      is_required: z.boolean().default(false),
      placeholder: z.string().max(255).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: maxRow } = await context.supabase
      .from("chain_of_custody_fields").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const next = ((maxRow?.sort_order as number | undefined) ?? 0) + 10;
    const { data: row, error } = await context.supabase
      .from("chain_of_custody_fields").insert({ ...data, sort_order: next }).select().single();
    if (error) throw error;
    return row;
  });

export const updateCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(255).trim().optional(),
      field_type: cocFieldType.optional(),
      is_required: z.boolean().optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
      placeholder: z.string().max(255).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("chain_of_custody_fields").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chain_of_custody_fields").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listCocRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chain_of_custody_records").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getCocRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("chain_of_custody_records").select("*").eq("id", data.id).single();
    if (error) throw error;
    return row;
  });

export const createCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().min(1).max(128),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("chain_of_custody_records")
      .insert({ sample_id: data.sample_id, data: data.data, created_by: userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      sample_id: z.string().min(1).max(128).optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("chain_of_custody_records").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chain_of_custody_records").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
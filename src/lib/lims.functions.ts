import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: samples }, { data: audit }] = await Promise.all([
      supabase.from("samples").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit: undefined as never,
    ] as never);
    // Fallback: do a clean second call for audit if the trick above is rejected
    const { data: auditClean } = await supabase
      .from("audit_log").select("*").order("changed_at", { ascending: false }).limit(15);
    const { data: results } = await supabase.from("results").select("purity_percentage");
    const counts = { received: 0, in_progress: 0, reviewed: 0, approved: 0 };
    (samples ?? []).forEach((s: { status: string }) => {
      if (s.status in counts) (counts as Record<string, number>)[s.status]++;
    });
    const purities = (results ?? []).map(r => Number(r.purity_percentage)).filter(n => !isNaN(n));
    const avgPurity = purities.length ? purities.reduce((a, b) => a + b, 0) / purities.length : null;
    return { samples: samples ?? [], audit: auditClean ?? audit ?? [], counts, avgPurity };
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
    const { data: results } = testIds.length
      ? await supabase.from("results").select("*").in("test_id", testIds)
      : { data: [] as Array<Record<string, unknown>> };
    return { sample, tests: tests ?? [], results: results ?? [] };
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
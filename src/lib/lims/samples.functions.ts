import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      status: z.enum(["received", "intake_verified", "prep", "in_progress", "reviewed", "complete", "approved"]),
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
/**
 * Sample Disposal Log: every sample_locations row (received/instrument/
 * dilution — only 'instrument' is populated so far) plus the editable
 * post-completion retention window before disposal is allowed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SampleLocationRow {
  id: string;
  sample_id: string;
  location_type: string;
  location: string;
  status: string;
  assigned_at: string;
  removed_at: string | null;
  disposed_at: string | null;
  sample: {
    batch_id: string;
    client: string;
    compound: string | null;
    actual_completion_date: string | null;
  } | null;
}

export const listSampleLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sample_locations")
      .select("id, sample_id, location_type, location, status, assigned_at, removed_at, disposed_at, sample:samples(batch_id, client, compound, actual_completion_date)")
      .order("assigned_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as SampleLocationRow[];
  });

export const getDisposalConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("disposal_config")
      .select("retention_days")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { retention_days: data?.retention_days ?? 30 };
  });

export const updateDisposalConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    retention_days: z.number().int().min(0).max(3650),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("disposal_config")
      .update({ retention_days: data.retention_days })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });

export const disposeSampleLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: loc, error: locErr } = await context.supabase
      .from("sample_locations")
      .select("id, status, sample:samples(actual_completion_date)")
      .eq("id", data.id)
      .maybeSingle();
    if (locErr) throw locErr;
    if (!loc) throw new Error("Location record not found");
    if (loc.status !== "removed") {
      throw new Error("Only locations already removed from the instrument can be disposed");
    }
    const completionDate = (loc as unknown as { sample: { actual_completion_date: string | null } | null }).sample?.actual_completion_date;
    if (!completionDate) {
      throw new Error("Sample has no recorded completion date yet");
    }
    const { data: cfg } = await context.supabase
      .from("disposal_config")
      .select("retention_days")
      .limit(1)
      .maybeSingle();
    const retentionDays = cfg?.retention_days ?? 30;
    const eligibleAt = new Date(completionDate);
    eligibleAt.setUTCDate(eligibleAt.getUTCDate() + retentionDays);
    if (eligibleAt.getTime() > Date.now()) {
      throw new Error(`Not eligible for disposal until ${eligibleAt.toISOString().slice(0, 10)} (${retentionDays}-day retention window)`);
    }

    const { error } = await context.supabase
      .from("sample_locations")
      .update({ status: "disposed", disposed_at: new Date().toISOString(), disposed_by: context.userId })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

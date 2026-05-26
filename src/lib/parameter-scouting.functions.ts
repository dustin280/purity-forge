/**
 * Server functions for the Parameter Scouting Log: list/create/update/delete HPLC
 * method scouting entries. All endpoints require auth; RLS scopes per role/creator.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const gradientStepSchema = z.object({
  time_min: z.number().finite(),
  percent_a: z.number().finite(),
  percent_b: z.number().finite(),
});

const runListItemSchema = z.object({
  parameter_id: z.string().uuid().nullable(),
  name: z.string().min(1).max(255),
  concentration_mg_per_l: z.number().finite().nullable(),
});

export type GradientStep = z.infer<typeof gradientStepSchema>;
export type RunListItem = z.infer<typeof runListItemSchema>;

export interface ParameterScoutingRow {
  id: string;
  run_at: string;
  user_id: string | null;
  user_name: string;
  flow_rate_ml_per_min: number | null;
  temperature_c: number | null;
  mobile_phase_a: string;
  mobile_phase_b: string;
  sample_diluent: string | null;
  comments: string | null;
  gradient: GradientStep[];
  run_list: RunListItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const basePayloadSchema = z.object({
  run_at: z.string().min(1),
  user_name: z.string().min(1).max(255),
  flow_rate_ml_per_min: z.number().finite().nullable(),
  temperature_c: z.number().finite().nullable(),
  mobile_phase_a: z.string().min(1).max(255),
  mobile_phase_b: z.string().min(1).max(255),
  sample_diluent: z.string().max(500).nullable().optional(),
  comments: z.string().max(4000).nullable().optional(),
  gradient: z.array(gradientStepSchema).max(50),
  run_list: z.array(runListItemSchema).max(400),
});

const updateSchema = basePayloadSchema.extend({ id: z.string().uuid() });

export const listParameterScoutingLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("parameter_scouting_logs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as ParameterScoutingRow[];
  });

export const createParameterScoutingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => basePayloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("parameter_scouting_logs")
      .insert({
        ...data,
        sample_diluent: data.sample_diluent || null,
        comments: data.comments || null,
        user_id: context.userId,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as unknown as ParameterScoutingRow;
  });

export const updateParameterScoutingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("parameter_scouting_logs")
      .update({
        ...patch,
        sample_diluent: patch.sample_diluent || null,
        comments: patch.comments || null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as unknown as ParameterScoutingRow;
  });

export const deleteParameterScoutingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("parameter_scouting_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
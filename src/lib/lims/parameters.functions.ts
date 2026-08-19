import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listParameters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("test_parameters").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const testTypeEnum = z.enum(["purity", "sterility", "endotoxin", "heavy_metals"]);

export const createParameter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(128).trim(),
      // Routes this flag to a stable test_type at intake — see
      // provisionTestsForSample. Left unset for ordinary compound-name
      // entries (BPC-157, TB-500, etc.), which don't provision anything.
      maps_to_test_type: testTypeEnum.nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("test_parameters")
      .insert({ name: data.name, maps_to_test_type: data.maps_to_test_type ?? null, created_by: userId })
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
      maps_to_test_type: testTypeEnum.nullable().optional(),
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
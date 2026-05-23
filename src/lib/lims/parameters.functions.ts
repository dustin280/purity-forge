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
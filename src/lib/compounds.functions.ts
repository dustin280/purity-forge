import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Compound = {
  id: string;
  name: string;
  is_active: boolean;
  method_group_id: string | null;
  injection_volume_ul: number | null;
};

export const listCompounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("compounds")
      .select("id, name, is_active, method_group_id, injection_volume_ul")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Compound[];
  });

export const createCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(160).trim() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Case-insensitive duplicate check (unique index also enforces it).
    const { data: existing, error: lookupErr } = await supabase
      .from("compounds")
      .select("id, name, is_active, method_group_id, injection_volume_ul")
      .ilike("name", data.name)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing) return existing as Compound;

    const { data: row, error } = await supabase
      .from("compounds")
      .insert({ name: data.name, created_by: userId })
      .select("id, name, is_active, method_group_id, injection_volume_ul")
      .single();
    if (error) throw error;
    return row as Compound;
  });

export const updateCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(160).trim().optional(),
        is_active: z.boolean().optional(),
        method_group_id: z.string().uuid().nullable().optional(),
        injection_volume_ul: z.number().min(0).max(100000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("compounds")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("compounds")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
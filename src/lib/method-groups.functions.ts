/**
 * CRUD server functions for Method Groups. Admin-only writes; all
 * authenticated users can read.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MethodGroup {
  id: string;
  name: string;
  temperature_c: number;
  priority: number;
  default_acquisition_method: string | null;
  default_processing_method: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  temperature_c: z.number().min(0).max(200),
  priority: z.number().int().min(1).max(999),
  default_acquisition_method: z.string().max(255).nullable().optional(),
  default_processing_method: z.string().max(255).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const listMethodGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("method_groups")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as MethodGroup[];
  });

export const upsertMethodGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = {
      name: data.name,
      temperature_c: data.temperature_c,
      priority: data.priority,
      default_acquisition_method: data.default_acquisition_method ?? null,
      default_processing_method: data.default_processing_method ?? null,
      description: data.description ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("method_groups").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row as unknown as MethodGroup;
    }
    const { data: row, error } = await context.supabase
      .from("method_groups").insert(payload).select().single();
    if (error) throw error;
    return row as unknown as MethodGroup;
  });

export const deleteMethodGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("method_groups").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
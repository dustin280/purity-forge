import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RunListColumnSource = "literal" | "sample_field" | "method" | "vial" | "data_file_pattern";

export interface RunListColumn {
  id: string;
  key: string;
  label: string;
  source: RunListColumnSource;
  default_value: string | null;
  sample_field: string | null;
  sort_order: number;
  is_active: boolean;
}

export const listRunListColumns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("run_list_columns")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as RunListColumn[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  source: z.enum(["literal", "sample_field", "method", "vial", "data_file_pattern"]),
  default_value: z.string().max(500).nullable().optional(),
  sample_field: z.string().max(80).nullable().optional(),
  sort_order: z.number().int().min(0).max(10000).default(0),
  is_active: z.boolean().default(true),
});

export const upsertRunListColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = {
      key: data.key,
      label: data.label,
      source: data.source,
      default_value: data.default_value ?? null,
      sample_field: data.sample_field ?? null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("run_list_columns").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("run_list_columns").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteRunListColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("run_list_columns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
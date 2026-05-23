import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const cocFieldType = z.enum(["text", "textarea", "number", "date", "datetime", "email", "tel", "multiselect"]);

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
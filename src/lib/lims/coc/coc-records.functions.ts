import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCocRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chain_of_custody_records").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getCocRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("chain_of_custody_records").select("*").eq("id", data.id).single();
    if (error) throw error;
    return row;
  });

export const createCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sample_id: z.string().min(1).max(128),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("chain_of_custody_records")
      .insert({ sample_id: data.sample_id, data: data.data, created_by: userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const updateCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      sample_id: z.string().min(1).max(128).optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])).optional(),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("chain_of_custody_records").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chain_of_custody_records").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const nextCocInvoiceNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `COC${mm}${dd}${yy}-`;
    const { data, error } = await context.supabase
      .from("chain_of_custody_records")
      .select("sample_id")
      .like("sample_id", "COC%");
    if (error) throw error;
    let max = 99;
    for (const r of data ?? []) {
      const sid = String((r as { sample_id: string }).sample_id);
      const dash = sid.lastIndexOf("-");
      if (dash < 0) continue;
      const n = parseInt(sid.slice(dash + 1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return { invoice: `${prefix}${max + 1}` };
  });
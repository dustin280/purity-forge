import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Hand a reserved-but-unused Sample ID back to the pool so the sequence
 * stays gap-free (see the sample_id_pool migration). The DB function is
 * the authority on whether release is safe -- it refuses any id that
 * already has samples, a CoC, lots, or a live pending order behind it, so
 * a stale client can't recycle a real record's number.
 */
export const releaseSampleId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sample_id: z.string().min(1).max(64), reason: z.string().max(64).optional() }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { data: released, error } = await context.supabase
      .rpc("release_sample_id", { p_sample_id: data.sample_id, p_reason: data.reason ?? null });
    if (error) throw error;
    return { released: !!released };
  });

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
    // Reserves the number atomically so repeat "Print blank" clicks never
    // stamp the same Lab Sample ID.
    const { data, error } = await context.supabase.rpc("next_coc_invoice_number");
    if (error) throw error;
    return { invoice: data as unknown as string };
  });
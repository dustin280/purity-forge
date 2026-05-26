/**
 * Server functions for the admin-managed instrument list used by the
 * Instrument Scheduler. All authenticated users can read; only admins
 * can mutate.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Instrument {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const listInstruments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instruments")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as Instrument[];
  });

export const adminUpsertInstrument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = {
      name: data.name,
      location: data.location ?? null,
      notes: data.notes ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("instruments")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row as unknown as Instrument;
    }
    const { data: row, error } = await context.supabase
      .from("instruments")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row as unknown as Instrument;
  });

export const adminDeleteInstrument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("instruments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
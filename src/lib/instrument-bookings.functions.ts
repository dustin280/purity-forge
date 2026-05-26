/**
 * Server functions for instrument bookings. Any signed-in user can list
 * bookings; tech/reviewer/admin can create bookings for themselves; owners
 * (and admins) can update or delete. DB triggers enforce non-overlap and
 * range/duration validity.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface InstrumentBooking {
  id: string;
  instrument_id: string;
  user_id: string;
  user_name: string;
  starts_at: string;
  ends_at: string;
  purpose: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const listSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  instrumentId: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  instrument_id: z.string().uuid(),
  user_name: z.string().min(1).max(255),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  purpose: z.string().min(1).max(80),
  notes: z.string().max(500).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  instrument_id: z.string().uuid().optional(),
  starts_at: z.string().min(1).optional(),
  ends_at: z.string().min(1).optional(),
  purpose: z.string().min(1).max(80).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("instrument_bookings")
      .select("*")
      .lt("starts_at", data.to)
      .gt("ends_at", data.from)
      .order("starts_at", { ascending: true });
    if (data.instrumentId) q = q.eq("instrument_id", data.instrumentId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as unknown as InstrumentBooking[];
  });

export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("instrument_bookings")
      .insert({
        instrument_id: data.instrument_id,
        user_id: context.userId,
        user_name: data.user_name,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        purpose: data.purpose,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as InstrumentBooking;
  });

export const updateBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const clean: {
      instrument_id?: string;
      starts_at?: string;
      ends_at?: string;
      purpose?: string;
      notes?: string | null;
    } = {};
    if (patch.instrument_id !== undefined) clean.instrument_id = patch.instrument_id;
    if (patch.starts_at !== undefined) clean.starts_at = patch.starts_at;
    if (patch.ends_at !== undefined) clean.ends_at = patch.ends_at;
    if (patch.purpose !== undefined) clean.purpose = patch.purpose;
    if (patch.notes !== undefined) clean.notes = patch.notes;
    const { data: row, error } = await context.supabase
      .from("instrument_bookings")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as InstrumentBooking;
  });

export const deleteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("instrument_bookings")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for the Pending Orders staging queue.
 *
 * Pending orders arrive from partner sites via the public webhook route
 * `/api/public/orders/intake` and sit in `pending_orders` until the physical
 * samples are received at the lab. When receiving, a CoC / Sample Receipt is
 * created through the normal flow and this queue's row is marked `received`
 * with a link back to the CoC (see `markPendingOrderReceived` and the
 * `pending_order_id` handoff in `submitCocWithSamples`).
 */

export const listPendingOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["pending", "received", "cancelled", "all"]).optional().default("pending"),
    }).parse(d ?? {})
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("pending_orders").select("*").order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getPendingOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("pending_orders").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Pending order not found");
    const { data: samples } = await supabase
      .from("pending_order_samples").select("*")
      .eq("pending_order_id", data.id).order("line_index", { ascending: true });
    return { order, samples: samples ?? [] };
  });

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("pending_orders").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
    }).eq("id", data.id).eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });

export const pendingOrderCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pending_orders").select("status");
    if (error) throw error;
    const counts = { pending: 0, received: 0, cancelled: 0 };
    (data ?? []).forEach((r) => {
      if (r.status === "pending" || r.status === "received" || r.status === "cancelled") counts[r.status] += 1;
    });
    return counts;
  });
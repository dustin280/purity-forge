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

/**
 * Reserve a real lab-generated SYX-NNNNNN id for a pending order, once.
 * Idempotent — safe to call from both "Print Labels" and "Receive" on the
 * same order, and always returns the same id once one exists, so printed
 * labels and the eventual receive form never disagree.
 */
export const reserveSampleIdForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("pending_orders").select("id, reserved_sample_id").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Pending order not found");
    if (order.reserved_sample_id) return { reserved_sample_id: order.reserved_sample_id as string };

    const { data: idRes, error: idErr } = await supabase.rpc("next_coc_invoice_number");
    if (idErr) throw idErr;
    const reservedId = idRes as unknown as string;

    const { error: updErr } = await supabase
      .from("pending_orders").update({ reserved_sample_id: reservedId }).eq("id", data.id);
    if (updErr) throw updErr;
    return { reserved_sample_id: reservedId };
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

/**
 * Edit a pending order (header fields + sample lines) before it is received.
 * Tech / reviewer / admin may edit; the original webhook `raw_payload` is left
 * untouched so the audit trail keeps what the partner actually sent.
 */
export const updatePendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      external_order_id: z.string().min(1).max(128),
      customer_name: z.string().max(255).nullable().optional(),
      customer_email: z.string().max(255).nullable().optional(),
      customer_company: z.string().max(255).nullable().optional(),
      carrier: z.string().max(64).nullable().optional(),
      tracking_number: z.string().max(128).nullable().optional(),
      order_date: z.string().nullable().optional(),
      expected_arrival: z.string().nullable().optional(),
      special_instructions: z.string().max(4000).nullable().optional(),
      samples: z.array(z.object({
        id: z.string().uuid().optional().nullable(),
        product_name: z.string().min(1).max(255),
        quantity: z.number().int().min(1).max(9999),
        lot_batch: z.string().max(128).optional().nullable(),
        external_sample_id: z.string().max(128).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })).max(500),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roles, error: roleErr } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (roleErr) throw roleErr;
    const allowed = (roles ?? []).some((r) => ["admin", "tech", "reviewer"].includes(r.role));
    if (!allowed) throw new Error("Not authorized to edit pending orders");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: curErr } = await supabaseAdmin
      .from("pending_orders").select("id, status").eq("id", data.id).maybeSingle();
    if (curErr) throw curErr;
    if (!current) throw new Error("Pending order not found");
    if (current.status !== "pending") throw new Error("Only pending orders can be edited");

    const nn = (v: string | null | undefined) => {
      const s = (v ?? "").trim();
      return s === "" ? null : s;
    };

    const { error: upErr } = await supabaseAdmin.from("pending_orders").update({
      external_order_id: data.external_order_id.trim(),
      customer_name: nn(data.customer_name),
      customer_email: nn(data.customer_email),
      customer_company: nn(data.customer_company),
      carrier: nn(data.carrier),
      tracking_number: nn(data.tracking_number),
      order_date: nn(data.order_date) ? new Date(data.order_date as string).toISOString() : null,
      expected_arrival: nn(data.expected_arrival),
      special_instructions: nn(data.special_instructions),
      total_samples: data.samples.length,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (upErr) throw upErr;

    const keepIds = data.samples.map((s) => s.id).filter(Boolean) as string[];
    let delQ = supabaseAdmin.from("pending_order_samples").delete().eq("pending_order_id", data.id);
    if (keepIds.length > 0) delQ = delQ.not("id", "in", `(${keepIds.join(",")})`);
    const { error: delErr } = await delQ;
    if (delErr) throw delErr;

    for (let i = 0; i < data.samples.length; i++) {
      const s = data.samples[i];
      const row = {
        pending_order_id: data.id,
        line_index: i,
        product_name: s.product_name.trim(),
        quantity: s.quantity,
        lot_batch: nn(s.lot_batch),
        external_sample_id: nn(s.external_sample_id),
        notes: nn(s.notes),
      };
      if (s.id) {
        const { error } = await supabaseAdmin.from("pending_order_samples").update(row).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from("pending_order_samples").insert(row);
        if (error) throw error;
      }
    }

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
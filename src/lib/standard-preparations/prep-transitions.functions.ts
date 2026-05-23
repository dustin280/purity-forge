/**
 * Status transition server function for standard prep logs
 * (draft → reviewed → approved, and reverting to draft).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StandardPrepRow } from "./prep-shared.server";

export const transitionStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      target: z.enum(["reviewed", "approved", "draft"]),
      actor_name: z.string().min(1).max(255),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { status: data.target };
    if (data.target === "reviewed") {
      patch.reviewer_id = context.userId;
      patch.reviewer_name = data.actor_name;
      patch.reviewed_at = new Date().toISOString();
    } else if (data.target === "approved") {
      patch.approver_id = context.userId;
      patch.approver_name = data.actor_name;
      patch.approved_at = new Date().toISOString();
    } else if (data.target === "draft") {
      patch.reviewer_id = null;
      patch.reviewer_name = null;
      patch.reviewed_at = null;
      patch.approver_id = null;
      patch.approver_name = null;
      patch.approved_at = null;
    }
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return row as unknown as StandardPrepRow;
  });
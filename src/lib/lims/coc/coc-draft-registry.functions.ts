/**
 * Cross-machine visibility for in-progress Sample Receipts.
 *
 * The draft itself stays in localStorage/IndexedDB on the machine it was
 * started on -- that's where the photos are, and they're far too big to sync
 * casually. What lives here is a registry row: who is working which Sample
 * ID, on which device, and when they last touched it.
 *
 * The problem this solves isn't ID collision (the Sample ID sequence is
 * server-side and hands out distinct numbers regardless). It's that two
 * people could work the same physical shipment from different machines with
 * no way to see each other, and only find out at submit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RemoteDraft = {
  draft_id: string;
  sample_id: string | null;
  pending_order_id: string | null;
  record_id: string | null;
  summary: string | null;
  device_label: string | null;
  photo_count: number;
  created_by: string | null;
  updated_at: string;
  /** Filled in below from profiles -- the table has no FK to it. */
  author_name?: string | null;
  /** True when this row was registered by the signed-in user. */
  is_mine?: boolean;
};

export const listCocDraftRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RemoteDraft[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("coc_draft_registry")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];

    const authorIds = Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)));
    const profiles = authorIds.length
      ? ((await supabase.from("profiles").select("id,full_name,first_name,last_name,email").in("id", authorIds)).data ?? [])
      : [];
    const nameById = new Map(profiles.map((p) => {
      const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      return [p.id, fl || p.full_name || p.email || null] as const;
    }));

    return rows.map((r) => ({
      ...r,
      author_name: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
      is_mine: r.created_by === userId,
    }));
  });

export const upsertCocDraftRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      draft_id: z.string().min(1).max(128),
      sample_id: z.string().max(128).nullable().optional(),
      pending_order_id: z.string().uuid().nullable().optional(),
      record_id: z.string().uuid().nullable().optional(),
      summary: z.string().max(500).nullable().optional(),
      device_label: z.string().max(120).nullable().optional(),
      photo_count: z.number().int().min(0).max(10000).default(0),
    }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("coc_draft_registry")
      .upsert({ ...data, created_by: userId, updated_at: new Date().toISOString() }, { onConflict: "draft_id" });
    if (error) throw error;
    return { ok: true };
  });

export const deleteCocDraftRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draft_id: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ context, data }) => {
    // RLS already restricts deletes to the author; a row belonging to someone
    // else simply matches nothing rather than erroring.
    const { error } = await context.supabase
      .from("coc_draft_registry").delete().eq("draft_id", data.draft_id);
    if (error) throw error;
    return { ok: true };
  });

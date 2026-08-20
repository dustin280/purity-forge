/**
 * CRUD + status transition server functions for individual standard prep logs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PREP_STATUSES,
  payloadSchema,
  emptyToNull,
  type StandardPrepRow,
  type PrepAttachmentRow,
  type PrepTargetRow,
} from "./prep-shared.server";

const SORT_COLUMNS = [
  "syn_id",
  "log_number",
  "prepared_at",
  "created_at",
  "standard_name",
  "analyst_name",
  "status",
] as const;

export const listStandardPreparations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      q: z.string().nullable().optional(),
      status: z.enum(PREP_STATUSES).nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
      analyst: z.string().nullable().optional(),
      sortBy: z.enum(SORT_COLUMNS).nullable().optional(),
      sortDir: z.enum(["asc", "desc"]).nullable().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sortBy = data.sortBy ?? "syn_id";
    const sortDir = data.sortDir ?? "desc";
    const ascending = sortDir === "asc";
    let q = context.supabase
      .from("standard_preparation_logs")
      .select("*, material_receipt:material_receipts!standard_preparation_logs_material_receipt_id_fkey(receipt_number, internal_lot)")
      .order(sortBy, { ascending, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("prepared_at", data.from);
    if (data.to) q = q.lte("prepared_at", data.to + "T23:59:59");
    if (data.analyst && data.analyst.trim()) {
      q = q.ilike("analyst_name", `%${data.analyst.trim()}%`);
    }
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `log_number.ilike.${term}`,
          `syn_id.ilike.${term}`,
          `standard_name.ilike.${term}`,
          `analyst_name.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getStandardPreparation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ data: log, error: e1 }, { data: atts, error: e2 }, { data: targets, error: e3 }, { data: usage, error: e4 }] = await Promise.all([
      context.supabase
        .from("standard_preparation_logs")
        .select("*, material_receipt:material_receipts!standard_preparation_logs_material_receipt_id_fkey(id, receipt_number, internal_lot, manufacturer_lot, material_name)")
        .eq("id", data.id)
        .single(),
      context.supabase
        .from("standard_preparation_attachments")
        .select("*")
        .eq("log_id", data.id)
        .order("uploaded_at", { ascending: false }),
      context.supabase
        .from("standard_preparation_targets")
        .select("*")
        .eq("prep_id", data.id)
        .order("row_no", { ascending: true }),
      context.supabase
        .from("standard_preparation_usage_log")
        .select("id, withdrawn_ml, purpose, notes, actor_name, created_at")
        .eq("prep_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    return {
      log: log as unknown as StandardPrepRow & { material_receipt: { id: string; receipt_number: string; internal_lot: string | null; manufacturer_lot: string | null; material_name: string } | null },
      attachments: (atts ?? []) as PrepAttachmentRow[],
      targets: (targets ?? []) as PrepTargetRow[],
      usageLog: (usage ?? []) as Array<{
        id: string; withdrawn_ml: number; purpose: string | null; notes: string | null;
        actor_name: string; created_at: string;
      }>,
    };
  });

export const createStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { targets, ...rest } = data;
    const payload = emptyToNull({
      ...rest,
      analyst_id: context.userId,
      created_by: context.userId,
      preparation_steps: rest.preparation_steps ?? [],
    });
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single();
    if (error) throw error;
    if (targets && targets.length > 0) {
      const inserts = targets.map(t => ({ ...t, prep_id: row.id }));
      const { error: tErr } = await context.supabase
        .from("standard_preparation_targets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(inserts as any);
      if (tErr) throw tErr;
    }
    return row as unknown as StandardPrepRow;
  });

export const updateStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: payloadSchema.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { targets, ...patch } = data.patch;
    const payload = emptyToNull(patch) as Record<string, unknown>;
    const { data: row, error } = await context.supabase
      .from("standard_preparation_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    if (targets) {
      const { error: dErr } = await context.supabase
        .from("standard_preparation_targets")
        .delete()
        .eq("prep_id", data.id);
      if (dErr) throw dErr;
      if (targets.length > 0) {
        const inserts = targets.map(t => ({ ...t, prep_id: data.id }));
        const { error: tErr } = await context.supabase
          .from("standard_preparation_targets")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(inserts as any);
        if (tErr) throw tErr;
      }
    }
    return row as unknown as StandardPrepRow;
  });

export const deleteStandardPreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: atts } = await context.supabase
      .from("standard_preparation_attachments")
      .select("file_path")
      .eq("log_id", data.id);
    const { error } = await context.supabase
      .from("standard_preparation_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    const paths = (atts ?? []).map((a: { file_path: string }) => a.file_path);
    if (paths.length > 0) {
      await context.supabase.storage.from("standard-preparations").remove(paths);
    }
    return { ok: true };
  });

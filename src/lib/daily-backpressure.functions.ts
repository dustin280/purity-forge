/**
 * Server functions for the Daily Backpressure log: list, create, and update HPLC system backpressure readings. All endpoints require authentication; RLS scopes writes per user/role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";

export interface BackpressureRow {
  id: string;
  reading_at: string;
  user_name: string;
  user_id: string | null;
  instrument: string;
  backpressure: number;
  backpressure_unit: string;
  notes: string | null;
  injections_count: number | null;
  mobile_phase: string | null;
  flow_rate: number | null;
  flow_rate_unit: string | null;
  column_temp: number | null;
  column_temp_unit: string | null;
  column_name: string | null;
  source: "manual" | "auto" | "live";
  acquisition_method: string | null;
  pressure_run_min: number | null;
  pressure_run_max: number | null;
  drive_result_folder_id: string | null;
  drive_dx_file_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const payloadSchema = z.object({
  reading_at: z.string().min(1),
  user_name: z.string().min(1).max(255),
  instrument: z.string().min(1).max(255),
  backpressure: z.number().finite(),
  backpressure_unit: z.string().min(1).max(32),
  notes: z.string().max(2000).nullable().optional(),
  injections_count: z.number().int().min(0).max(100000).nullable().optional(),
  mobile_phase: z.string().max(500).nullable().optional(),
  flow_rate: z.number().finite().nullable().optional(),
  flow_rate_unit: z.string().max(32).nullable().optional(),
  column_temp: z.number().finite().nullable().optional(),
  column_temp_unit: z.string().max(8).nullable().optional(),
  column_name: z.string().max(255).nullable().optional(),
});

export interface BackpressureListFilters {
  /** ISO bounds, [from, to) */
  from: string;
  to: string;
  /** null = every row; "" = rows with no column recorded; otherwise a column name */
  column: string | null;
}

/** PostgREST returns at most 1000 rows per request; a range is read page by page. */
const LIST_PAGE = 1000;
/** ~40 days at 250 sequences a day; the table says so when this is hit. */
const LIST_MAX_ROWS = 10000;

const listFiltersSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  column: z.string().max(255).nullable().optional(),
});

/**
 * Rows newest first. With a range: every row in it (up to LIST_MAX_ROWS, in
 * pages); without: the newest 500, for callers that only want a recent slice.
 */
export const listBackpressureLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listFiltersSchema.parse(d ?? {}))
  .handler(async ({ context, data }): Promise<{ rows: BackpressureRow[]; truncated: boolean }> => {
    const max = data.from ? LIST_MAX_ROWS : 500;
    const rows: BackpressureRow[] = [];
    for (let offset = 0; offset < max; offset += LIST_PAGE) {
      let q = context.supabase
        .from("daily_backpressure_logs")
        .select("*")
        .order("reading_at", { ascending: false })
        .range(offset, Math.min(offset + LIST_PAGE, max) - 1);
      if (data.from) q = q.gte("reading_at", data.from);
      if (data.to) q = q.lt("reading_at", data.to);
      if (data.column === "") q = q.is("column_name", null);
      else if (data.column) q = q.eq("column_name", data.column);
      const { data: page, error } = await q;
      if (error) throw error;
      const got = (page ?? []) as BackpressureRow[];
      rows.push(...got);
      if (got.length < Math.min(LIST_PAGE, max - offset)) return { rows, truncated: false };
    }
    return { rows, truncated: true };
  });

export interface BackpressureDailySummaryRow {
  /** YYYY-MM-DD in the requested zone */
  day: string;
  column_name: string | null;
  instrument: string;
  sequences: number;
  injections: number;
  /** mean of the sequences' "at initiation" pressures, bar */
  initiation_bar: number;
  initiation_min_bar: number;
  initiation_max_bar: number;
  /** highest pressure any run reached that day, bar */
  run_max_bar: number | null;
  run_min_bar: number | null;
  flow_ml_min: number | null;
  column_temp_c: number | null;
  first_at: string;
  last_at: string;
  noted: number;
  manual: number;
}

/**
 * One row per local day, column and instrument (daily_backpressure_daily_summary):
 * the per-sequence rows stay the record; this is what the chart reads so it
 * stays legible at hundreds of sequences a day.
 */
export const listBackpressureDailySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        tz: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9_+\-/]+$/),
        column: z.string().max(255).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<BackpressureDailySummaryRow[]> => {
    const { data: rows, error } = await (context.supabase as AnySupabase).rpc(
      "daily_backpressure_daily_summary",
      {
        p_from: data.from,
        p_to: data.to,
        p_tz: data.tz,
        p_column: data.column ?? null,
      },
    );
    if (error) throw error;
    return (rows ?? []) as unknown as BackpressureDailySummaryRow[];
  });

export const createBackpressureLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payloadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("daily_backpressure_logs")
      .insert({
        ...data,
        notes: data.notes || null,
        user_id: context.userId,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row as BackpressureRow;
  });

export const deleteBackpressureLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("daily_backpressure_logs")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

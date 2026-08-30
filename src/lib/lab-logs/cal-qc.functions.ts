/**
 * Read-side server functions for the Cal Std / QC Peak Trend Log — the
 * write side (the watcher itself) lives in cal-qc-watcher.functions.ts,
 * same split as daily-backpressure.functions.ts vs pressure-watcher.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CalQcPeakRow {
  id: string;
  sample_type: "cal_std" | "qc_check";
  compound_id: string | null;
  raw_compound_name: string;
  match_confidence: "exact" | "fuzzy" | "unmatched";
  sample_name: string | null;
  calibration_level: number | null;
  concentration_level: number | null;
  concentration_unit: string | null;
  rt: number;
  area: number | null;
  amount: number | null;
  reading_at: string;
  sequence_name: string;
  injection_id: string;
  source_result_file_id: string;
  created_at: string;
  /** Hard partition — never compare metrics across different values here. */
  acq_method_name: string | null;
  processing_method_name: string | null;
  processing_state: string | null;
  height_mau: number | null;
  calibration_amount: number | null;
}

export const listCalQcPeakLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cal_qc_peak_log")
      .select("*")
      .order("reading_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as CalQcPeakRow[];
  });

export interface UnmatchedCompoundGroup {
  raw_compound_name: string;
  count: number;
}

export const listUnmatchedCalQcCompounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cal_qc_peak_log")
      .select("raw_compound_name")
      .eq("match_confidence", "unmatched");
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ raw_compound_name: string }>) {
      counts.set(r.raw_compound_name, (counts.get(r.raw_compound_name) ?? 0) + 1);
    }
    return Array.from(counts, ([raw_compound_name, count]) => ({ raw_compound_name, count })).sort(
      (a, b) => b.count - a.count,
    ) as UnmatchedCompoundGroup[];
  });

export interface RtReferenceBand {
  estimated_rt_min: number;
  rt_window_min: number;
}

/**
 * Best-effort enrichment: compounds -> sp_analyte_id -> sp_methods.analyte_id
 * -> the approved sp_method_revisions row's estimated_rt_min/rt_window_min,
 * for shading an expected-RT band on the trend chart. Returns null at any
 * missing link (no analyte, no method, no approved revision, no estimate)
 * rather than treating any of those as an error — most compounds won't have
 * a formal SOP method wired up, and that's a normal, unremarkable state.
 */
export const getRtReferenceBand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (typeof d !== "object" || d === null || !("compoundId" in d)) throw new Error("compoundId required");
    return d as { compoundId: string };
  })
  .handler(async ({ context, data }): Promise<RtReferenceBand | null> => {
    const { data: compound } = await context.supabase
      .from("compounds")
      .select("sp_analyte_id")
      .eq("id", data.compoundId)
      .maybeSingle();
    if (!compound?.sp_analyte_id) return null;

    const { data: methods } = await context.supabase
      .from("sp_methods")
      .select("id")
      .eq("analyte_id", compound.sp_analyte_id);
    const methodIds = (methods ?? []).map((m: { id: string }) => m.id);
    if (methodIds.length === 0) return null;

    const { data: revision } = await context.supabase
      .from("sp_method_revisions")
      .select("estimated_rt_min, rt_window_min")
      .in("method_id", methodIds)
      .eq("status", "approved")
      .not("estimated_rt_min", "is", null)
      .limit(1)
      .maybeSingle();
    if (!revision?.estimated_rt_min) return null;

    return {
      estimated_rt_min: revision.estimated_rt_min,
      rt_window_min: revision.rt_window_min ?? 0,
    };
  });

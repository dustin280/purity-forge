import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toDisplayStatus, type SampleStatus, type DisplayStatus } from "@/lib/lims-utils";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: samplesAll }, { data: recent }, { data: audit }, { data: results }] = await Promise.all([
      supabase.from("samples").select("status"),
      supabase.from("samples").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(15),
      supabase.from("results").select("purity_percentage"),
    ]);
    // Bucketed by display status so every raw status is counted exactly
    // once, instead of the old per-raw-status tally that silently dropped
    // scheduled/in_analysis/on_hold/cancelled samples from the total.
    const counts: Record<DisplayStatus, number> = {
      received: 0, in_progress: 0, on_hold: 0, in_review: 0, complete: 0, cancelled: 0,
    };
    (samplesAll ?? []).forEach((s: { status: string }) => {
      counts[toDisplayStatus(s.status as SampleStatus)]++;
    });
    const purities = (results ?? []).map(r => Number(r.purity_percentage)).filter(n => !isNaN(n));
    const avgPurity = purities.length ? purities.reduce((a, b) => a + b, 0) / purities.length : null;
    return { samples: recent ?? [], audit: audit ?? [], counts, avgPurity };
  });
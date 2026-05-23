import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const counts = { received: 0, intake_verified: 0, prep: 0, in_progress: 0, reviewed: 0, complete: 0, approved: 0 };
    (samplesAll ?? []).forEach((s: { status: string }) => {
      if (s.status in counts) (counts as Record<string, number>)[s.status]++;
    });
    const purities = (results ?? []).map(r => Number(r.purity_percentage)).filter(n => !isNaN(n));
    const avgPurity = purities.length ? purities.reduce((a, b) => a + b, 0) / purities.length : null;
    return { samples: recent ?? [], audit: audit ?? [], counts, avgPurity };
  });
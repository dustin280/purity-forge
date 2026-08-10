/**
 * Run-list <-> preparation-record coverage.
 *
 * getRunListPrepCoverage: per-row coverage view used to render "warn only"
 * prep-readiness on the run-list detail page. Per-sample generation itself
 * now lives in generate-from-run-list.functions.ts (generateSamplePrepForRunList),
 * which supersedes the old per-compound draft generator that used to live here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const IdInput = z.object({ run_list_id: z.string().uuid() });

interface RowCtx {
  item_id: string;
  sample_id: string | null;
  batch_id: string | null;
  compound: string | null;
  linked_prep_id: string | null;
}

async function loadRunListRows(supabase: SB, runListId: string): Promise<RowCtx[]> {
  const { data: items, error } = await supabase
    .from("run_list_items")
    .select("id, sample_id, sp_preparation_record_id")
    .eq("run_list_id", runListId)
    .order("row_no");
  if (error) throw error;
  const rows = (items ?? []) as Array<{ id: string; sample_id: string | null; sp_preparation_record_id: string | null }>;
  const sampleIds = Array.from(new Set(rows.map(r => r.sample_id).filter(Boolean))) as string[];
  let samples: Array<{ id: string; batch_id: string | null; compound: string | null }> = [];
  if (sampleIds.length) {
    const { data } = await supabase.from("samples").select("id,batch_id,compound").in("id", sampleIds);
    samples = (data ?? []) as typeof samples;
  }
  const map = new Map(samples.map(s => [s.id, s] as const));
  return rows.map(r => {
    const s = r.sample_id ? map.get(r.sample_id) ?? null : null;
    return {
      item_id: r.id,
      sample_id: r.sample_id,
      batch_id: s?.batch_id ?? null,
      compound: s?.compound ?? null,
      linked_prep_id: r.sp_preparation_record_id,
    };
  });
}

export interface PrepCoverageRow {
  item_id: string;
  sample_id: string | null;
  batch_id: string | null;
  compound: string | null;
  prep_id: string | null;
  prep_number: string | null;
  prep_status: string | null;
  expires_at: string | null;
  warning:
    | null
    | "unlinked"
    | "not_approved"
    | "expired"
    | "rejected"
    | "no_compound";
}

export const getRunListPrepCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: PrepCoverageRow[] }> => {
    const rows = await loadRunListRows(context.supabase, data.run_list_id);
    const prepIds = Array.from(new Set(rows.map(r => r.linked_prep_id).filter(Boolean))) as string[];
    let preps: Array<{ id: string; prep_number: string; status: string; expires_at: string | null }> = [];
    if (prepIds.length) {
      const { data: p } = await context.supabase
        .from("sp_preparation_records")
        .select("id, prep_number, status, expires_at")
        .in("id", prepIds);
      preps = (p ?? []) as typeof preps;
    }
    const prepMap = new Map(preps.map(p => [p.id, p] as const));
    const now = Date.now();
    const out: PrepCoverageRow[] = rows.map(r => {
      const prep = r.linked_prep_id ? prepMap.get(r.linked_prep_id) ?? null : null;
      let warning: PrepCoverageRow["warning"] = null;
      if (!r.compound) warning = "no_compound";
      else if (!prep) warning = "unlinked";
      else if (prep.status === "rejected") warning = "rejected";
      else if (prep.status !== "approved") warning = "not_approved";
      else if (prep.expires_at && new Date(prep.expires_at).getTime() < now) warning = "expired";
      return {
        item_id: r.item_id,
        sample_id: r.sample_id,
        batch_id: r.batch_id,
        compound: r.compound,
        prep_id: prep?.id ?? null,
        prep_number: prep?.prep_number ?? null,
        prep_status: prep?.status ?? null,
        expires_at: prep?.expires_at ?? null,
        warning,
      };
    });
    return { rows: out };
  });

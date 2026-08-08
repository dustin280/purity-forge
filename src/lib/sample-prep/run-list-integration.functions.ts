/**
 * Phase 1D — Run-list ↔ preparation-record integration.
 *
 * - generatePrepDraftsForRunList: resolves each unique compound on a run list
 *   to an sp_analyte (name or alias, case-insensitive), picks the most recent
 *   approved sp_method_revision for that analyte, creates one draft
 *   sp_preparation_record per (analyte, revision), and links matching
 *   run_list_items to it. Items already linked are left alone.
 * - getRunListPrepCoverage: per-row coverage view used to render "warn only"
 *   prep-readiness on the run-list detail page.
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

/** Resolve a compound label to an analyte id via name or alias, case-insensitive. */
async function resolveAnalyteIds(supabase: SB, labels: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!labels.length) return out;
  const lc = labels.map(l => l.toLowerCase());
  const [{ data: byName }, { data: byAlias }] = await Promise.all([
    supabase.from("sp_analytes").select("id,canonical_name,abbreviation"),
    supabase.from("sp_analyte_aliases").select("analyte_id,alias"),
  ]);
  const analytes = (byName ?? []) as Array<{ id: string; canonical_name: string; abbreviation: string | null }>;
  const aliases = (byAlias ?? []) as Array<{ analyte_id: string; alias: string }>;
  for (const label of lc) {
    const hit = analytes.find(a =>
      a.canonical_name.toLowerCase() === label ||
      (a.abbreviation && a.abbreviation.toLowerCase() === label),
    );
    if (hit) { out.set(label, hit.id); continue; }
    const alias = aliases.find(a => a.alias.toLowerCase() === label);
    if (alias) out.set(label, alias.analyte_id);
  }
  return out;
}

/** Pick the most recent approved revision for each analyte id. */
async function pickApprovedRevisions(supabase: SB, analyteIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!analyteIds.length) return out;
  const { data: methods } = await supabase
    .from("sp_methods")
    .select("id,analyte_id,is_active")
    .in("analyte_id", analyteIds)
    .eq("is_active", true);
  const methodRows = (methods ?? []) as Array<{ id: string; analyte_id: string }>;
  if (!methodRows.length) return out;
  const methodIds = methodRows.map(m => m.id);
  const { data: revs } = await supabase
    .from("sp_method_revisions")
    .select("id,method_id,revision,status,approval_date")
    .in("method_id", methodIds)
    .eq("status", "approved")
    .order("revision", { ascending: false });
  const revRows = (revs ?? []) as Array<{ id: string; method_id: string; revision: number }>;
  const methodToAnalyte = new Map(methodRows.map(m => [m.id, m.analyte_id] as const));
  for (const r of revRows) {
    const analyte = methodToAnalyte.get(r.method_id);
    if (analyte && !out.has(analyte)) out.set(analyte, r.id);
  }
  return out;
}

export const generatePrepDraftsForRunList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const rows = await loadRunListRows(context.supabase, data.run_list_id);
    const unlinked = rows.filter(r => !r.linked_prep_id && r.compound && r.compound.trim());
    const uniqueCompounds = Array.from(new Set(unlinked.map(r => r.compound!.trim())));
    const analyteMap = await resolveAnalyteIds(context.supabase, uniqueCompounds);
    const analyteIds = Array.from(new Set(Array.from(analyteMap.values())));
    const revMap = await pickApprovedRevisions(context.supabase, analyteIds);

    const created: Array<{ prep_id: string; prep_number: string; analyte_id: string; compound: string }> = [];
    const unresolved: Array<{ compound: string; reason: "no_analyte" | "no_approved_revision" }> = [];
    let linkedItems = 0;

    // Cache one draft per (analyte_id, revision_id) so items sharing a compound share a prep.
    const prepByAnalyte = new Map<string, string>();

    for (const compound of uniqueCompounds) {
      const key = compound.toLowerCase();
      const analyteId = analyteMap.get(key);
      if (!analyteId) { unresolved.push({ compound, reason: "no_analyte" }); continue; }
      const revisionId = revMap.get(analyteId);
      if (!revisionId) { unresolved.push({ compound, reason: "no_approved_revision" }); continue; }

      let prepId = prepByAnalyte.get(analyteId);
      if (!prepId) {
        const { data: prepNumberData, error: numErr } = await context.supabase.rpc("next_sp_prep_number");
        if (numErr) throw numErr;
        const { data: rec, error: insErr } = await context.supabase
          .from("sp_preparation_records")
          .insert({
            prep_number: prepNumberData as unknown as string,
            method_revision_id: revisionId,
            analyte_id: analyteId,
            status: "draft",
            sample_context: { source: "run_list", run_list_id: data.run_list_id, compound },
            plan: {},
            prepared_by: context.userId,
          })
          .select("id, prep_number")
          .single();
        if (insErr) throw insErr;
        prepId = rec.id as string;
        prepByAnalyte.set(analyteId, prepId);
        created.push({ prep_id: prepId, prep_number: rec.prep_number as string, analyte_id: analyteId, compound });
      }

      const itemIds = unlinked
        .filter(r => (r.compound ?? "").trim().toLowerCase() === key)
        .map(r => r.item_id);
      if (itemIds.length) {
        const { error: linkErr } = await context.supabase
          .from("run_list_items")
          .update({ sp_preparation_record_id: prepId })
          .in("id", itemIds);
        if (linkErr) throw linkErr;
        linkedItems += itemIds.length;
      }
    }

    const skipped_already_linked = rows.filter(r => r.linked_prep_id).length;
    return { created, unresolved, linked_items: linkedItems, skipped_already_linked };
  });

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
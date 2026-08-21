/**
 * CRUD for the Non-Conformity Identifier reference library (compounds,
 * impurity/oligomer candidates, spectral panels). Read-only against
 * samples/compounds — never writes to compliance tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "./supabase-any";

export const listNcCompounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as AnySupabase)
      .from("nc_compounds")
      .select("id, name, class, molecular_formula, review_flag")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string; class: string | null; molecular_formula: string | null; review_flag: string | null }>;
  });

export const getNcCompoundDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as AnySupabase;
    const [{ data: compound, error: e1 }, { data: impurities, error: e2 }, { data: oligomers, error: e3 }, { data: panel, error: e4 }] = await Promise.all([
      supabase.from("nc_compounds").select("*").eq("id", data.id).single(),
      supabase.from("nc_impurity_candidates").select("*").eq("nc_compound_id", data.id).order("impurity_code", { ascending: true }),
      supabase.from("nc_oligomer_candidates").select("*").eq("nc_compound_id", data.id).order("oligomer_code", { ascending: true }),
      supabase.from("nc_spectral_panels").select("*").eq("nc_compound_id", data.id).maybeSingle(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    return { compound, impurities: impurities ?? [], oligomers: oligomers ?? [], panel: panel ?? null };
  });

const compoundInput = z.object({
  name: z.string().min(1).max(255),
  class: z.string().max(255).nullable().optional(),
  sequence_composition: z.string().max(2000).nullable().optional(),
  molecular_formula: z.string().max(255).nullable().optional(),
  monoisotopic_mass: z.number().nullable().optional(),
  dad_primary: z.string().max(255).nullable().optional(),
  dad_secondary: z.string().max(255).nullable().optional(),
  dad_guidance: z.string().max(2000).nullable().optional(),
  key_chromophores: z.string().max(500).nullable().optional(),
  form_notes: z.string().max(2000).nullable().optional(),
  source_url: z.string().max(1000).nullable().optional(),
});

export const addNcCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => compoundInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await (context.supabase as AnySupabase)
      .from("nc_compounds")
      .insert(data)
      .select("id, name")
      .single();
    if (error) throw error;
    return row as { id: string; name: string };
  });

const impurityCandidateInput = z.object({
  nc_compound_id: z.string().uuid(),
  impurity_code: z.string().min(1).max(120),
  name: z.string().min(1).max(500),
  category: z.string().max(255).nullable().optional(),
  evidence_level: z.string().max(120).nullable().optional(),
  formation_pathway: z.string().max(2000).nullable().optional(),
  molecular_formula: z.string().max(255).nullable().optional(),
  formula_delta: z.string().max(255).nullable().optional(),
  mass_delta: z.number().nullable().optional(),
  dad_discriminator: z.string().max(2000).nullable().optional(),
  rp_hplc_behavior: z.string().max(1000).nullable().optional(),
  likely_trigger: z.string().max(1000).nullable().optional(),
  source_url: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const addNcImpurityCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => impurityCandidateInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await (context.supabase as AnySupabase)
      .from("nc_impurity_candidates")
      .insert(data)
      .select("id")
      .single();
    if (error) throw error;
    return row as { id: string };
  });

const oligomerCandidateInput = z.object({
  nc_compound_id: z.string().uuid(),
  oligomer_code: z.string().min(1).max(120),
  name: z.string().min(1).max(500),
  class: z.string().max(255).nullable().optional(),
  stoichiometry: z.string().max(120).nullable().optional(),
  evidence_level: z.string().max(120).nullable().optional(),
  mechanism_pathway: z.string().max(2000).nullable().optional(),
  mass_delta_vs_n_monomer: z.number().nullable().optional(),
  dad_discriminator: z.string().max(2000).nullable().optional(),
  rp_hplc_behavior: z.string().max(1000).nullable().optional(),
  false_positive_warning: z.string().max(2000).nullable().optional(),
  source_url: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const addNcOligomerCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => oligomerCandidateInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await (context.supabase as AnySupabase)
      .from("nc_oligomer_candidates")
      .insert(data)
      .select("id")
      .single();
    if (error) throw error;
    return row as { id: string };
  });

/**
 * Resolves a sample's compound against the nc_compounds library. Tries the
 * FK link first (nc_compounds.compound_id), then falls back to the same
 * exact→fuzzy name matching pattern established in
 * src/lib/lab-logs/cal-qc-matching.ts's matchCompound — never guesses.
 */
export const resolveNcCompoundForSample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    compoundId: z.string().uuid().nullable(),
    compoundName: z.string().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as AnySupabase;
    if (data.compoundId) {
      const { data: byFk } = await supabase.from("nc_compounds").select("id, name").eq("compound_id", data.compoundId).maybeSingle();
      if (byFk) return { nc_compound_id: byFk.id as string, name: byFk.name as string, matched: "fk" as const };
    }
    const clean = data.compoundName?.trim();
    if (!clean) return { nc_compound_id: null, name: null, matched: "unmatched" as const };
    const { data: exact } = await supabase.from("nc_compounds").select("id, name").ilike("name", clean).maybeSingle();
    if (exact) return { nc_compound_id: exact.id as string, name: exact.name as string, matched: "exact" as const };
    const { data: all } = await supabase.from("nc_compounds").select("id, name");
    const lower = clean.toLowerCase();
    const fuzzy = (all ?? []).find((c: { id: string; name: string }) => {
      const n = c.name.toLowerCase();
      return lower.includes(n) || n.includes(lower);
    });
    if (fuzzy) return { nc_compound_id: fuzzy.id as string, name: fuzzy.name as string, matched: "fuzzy" as const };
    return { nc_compound_id: null, name: null, matched: "unmatched" as const };
  });

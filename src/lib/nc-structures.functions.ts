/**
 * Read-only data layer for the Compound Explorer: the nc_compounds
 * reference library, their pre-computed 3D structures (nc_structures),
 * and the non-conformance scenarios (nc_impurity_candidates) whose
 * impurity variants can be loaded into the viewer alongside the native form.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySupabase } from "./non-conformity/supabase-any";

export type ExplorerCompound = {
  id: string;
  compound_id: string | null;
  name: string;
  class: string | null;
  molecular_formula: string | null;
  monoisotopic_mass: number | null;
  cas_number: string | null;
  review_flag: string | null;
};

export type StructureAtom = {
  id: number;
  element: string;
  x: number;
  y: number;
  z: number;
  residue_index: number;
  role: "backbone" | "sidechain" | "terminus" | "unassigned";
};
export type StructureBond = { a: number; b: number; order: number };
export type StructureResidue = { index: number; code: string; atom_ids: number[] };

export type ExplorerDetail = {
  compound: {
    id: string;
    compound_id: string | null;
    name: string;
    class: string | null;
    sequence_composition: string | null;
    amino_acid_composition: string | null;
    molecular_formula: string | null;
    monoisotopic_mass: number | null;
    mz_1plus: number | null;
    mz_2plus: number | null;
    cas_number: string | null;
    dad_primary: string | null;
    dad_secondary: string | null;
    dad_guidance: string | null;
    key_chromophores: string | null;
    form_notes: string | null;
    review_flag: string | null;
    source_url: string | null;
  };
  structure: {
    atoms: StructureAtom[];
    bonds: StructureBond[];
    residues: StructureResidue[];
    atom_count: number | null;
  } | null;
};

/**
 * A non-conformance scenario for a compound. `id` doubles as the
 * `nc_structures.variant_id` for the corresponding impurity structure —
 * `has_structure` says whether that 3D variant was actually generated
 * (many candidates are mechanism "families" with no single answerable
 * structure, so they carry analytical metadata only).
 */
export type NcScenario = {
  id: string;
  impurity_code: string | null;
  name: string;
  category: string | null;
  evidence_level: string | null;
  structure_change: string | null;
  formation_pathway: string | null;
  molecular_formula: string | null;
  formula_delta: string | null;
  mass_delta: number | null;
  monoisotopic_mass: number | null;
  mz_1plus: number | null;
  mz_2plus: number | null;
  rp_hplc_behavior: string | null;
  dad_discriminator: string | null;
  lc_ms_discriminator: string | null;
  likely_trigger: string | null;
  notes: string | null;
  has_structure: boolean;
};

export type VariantStructure = {
  atoms: StructureAtom[];
  bonds: StructureBond[];
  residues: StructureResidue[];
  atom_count: number | null;
  generation_source: string | null;
};

export const listExplorerCompounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as AnySupabase)
      .from("nc_compounds")
      .select("id, compound_id, name, class, molecular_formula, monoisotopic_mass, cas_number, review_flag")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ExplorerCompound[];
  });

export const getExplorerCompound = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<ExplorerDetail> => {
    const supabase = context.supabase as AnySupabase;
    const { data: compound, error } = await supabase
      .from("nc_compounds")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    let structure: ExplorerDetail["structure"] = null;
    if (compound?.id) {
      const { data: row, error: sErr } = await supabase
        .from("nc_structures")
        .select("atoms, bonds, residues, atom_count")
        .eq("nc_compound_id", compound.id)
        .eq("variant_kind", "native")
        .maybeSingle();
      if (sErr) throw sErr;
      if (row) {
        structure = {
          atoms: (row.atoms ?? []) as StructureAtom[],
          bonds: (row.bonds ?? []) as StructureBond[],
          residues: (row.residues ?? []) as StructureResidue[],
          atom_count: row.atom_count ?? null,
        };
      }
    }
    return { compound: compound as ExplorerDetail["compound"], structure };
  });

/**
 * Non-conformance scenarios for one compound, flagged with whether a 3D
 * impurity variant exists. Done as two reads plus an in-memory join: the
 * link is `nc_impurity_candidates.id -> nc_structures.variant_id`, which is
 * not a declared FK, so PostgREST cannot embed it.
 */
export const listCompoundScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ compoundId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<NcScenario[]> => {
    const supabase = context.supabase as AnySupabase;

    const { data: candidates, error } = await supabase
      .from("nc_impurity_candidates")
      .select(
        "id, impurity_code, name, category, evidence_level, structure_change, formation_pathway, molecular_formula, formula_delta, mass_delta, monoisotopic_mass, mz_1plus, mz_2plus, rp_hplc_behavior, dad_discriminator, lc_ms_discriminator, likely_trigger, notes",
      )
      .eq("nc_compound_id", data.compoundId)
      .order("impurity_code", { ascending: true });
    if (error) throw error;

    const { data: built, error: sErr } = await supabase
      .from("nc_structures")
      .select("variant_id")
      .eq("nc_compound_id", data.compoundId)
      .eq("variant_kind", "impurity");
    if (sErr) throw sErr;

    const withStructure = new Set<string>(
      ((built ?? []) as { variant_id: string | null }[])
        .map(r => r.variant_id)
        .filter((v): v is string => !!v),
    );

    const rows = (candidates ?? []) as Omit<NcScenario, "has_structure">[];
    return rows.map(c => ({ ...c, has_structure: withStructure.has(c.id) }));
  });

/** The 3D structure for one impurity variant, keyed by its candidate id. */
export const getVariantStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ variantId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<VariantStructure | null> => {
    const supabase = context.supabase as AnySupabase;
    const { data: row, error } = await supabase
      .from("nc_structures")
      .select("atoms, bonds, residues, atom_count, generation_source")
      .eq("variant_id", data.variantId)
      .eq("variant_kind", "impurity")
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    return {
      atoms: (row.atoms ?? []) as StructureAtom[],
      bonds: (row.bonds ?? []) as StructureBond[],
      residues: (row.residues ?? []) as StructureResidue[],
      atom_count: row.atom_count ?? null,
      generation_source: row.generation_source ?? null,
    };
  });

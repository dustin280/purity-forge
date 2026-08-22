/**
 * Read-only data layer for the Compound Explorer: the nc_compounds
 * reference library plus their pre-computed 3D structures (nc_structures).
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
    if (compound?.compound_id) {
      const { data: row, error: sErr } = await supabase
        .from("nc_structures")
        .select("atoms, bonds, residues, atom_count")
        .eq("nc_compound_id", compound.compound_id)
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

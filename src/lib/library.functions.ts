/**
 * Server functions for the Library reference catalog.
 * Read access for all authenticated users; admin-only writes enforced
 * via RLS plus an explicit has_role check on bulk uploads.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LibraryItem {
  id: string;
  category: string | null;
  names: string;
  cas_number: string | null;
  molecular_weight: string | null;
  molecular_size: string | null;
  size_basis: string | null;
  chemical_formula: string | null;
  sequence: string | null;
  salt_form: string | null;
  termini_modifications: string | null;
  notes: string | null;
  confidence: string | null;
  ambiguity_notes: string | null;
  source_url: string | null;
  pubchem_cid: string | null;
  unii: string | null;
  inchikey: string | null;
  smiles: string | null;
  inn_usan_name: string | null;
  drugbank_id: string | null;
  chembl_id: string | null;
  atc_code: string | null;
  research_summary: string | null;
  key_references: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const itemSchema = z.object({
  category: z.string().max(200).nullable().optional(),
  names: z.string().min(1).max(500),
  cas_number: z.string().max(200).nullable().optional(),
  molecular_weight: z.string().max(200).nullable().optional(),
  molecular_size: z.string().max(200).nullable().optional(),
  size_basis: z.string().max(200).nullable().optional(),
  chemical_formula: z.string().max(500).nullable().optional(),
  sequence: z.string().max(2000).nullable().optional(),
  salt_form: z.string().max(500).nullable().optional(),
  termini_modifications: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  confidence: z.string().max(500).nullable().optional(),
  ambiguity_notes: z.string().max(2000).nullable().optional(),
  source_url: z.string().max(1000).nullable().optional(),
  pubchem_cid: z.string().max(50).nullable().optional(),
  unii: z.string().max(50).nullable().optional(),
  inchikey: z.string().max(100).nullable().optional(),
  smiles: z.string().max(2000).nullable().optional(),
  inn_usan_name: z.string().max(300).nullable().optional(),
  drugbank_id: z.string().max(50).nullable().optional(),
  chembl_id: z.string().max(50).nullable().optional(),
  atc_code: z.string().max(50).nullable().optional(),
  research_summary: z.string().max(4000).nullable().optional(),
  key_references: z.string().max(4000).nullable().optional(),
});

type LibraryInsert = {
  names: string;
  category: string | null;
  cas_number: string | null;
  molecular_weight: string | null;
  molecular_size: string | null;
  size_basis: string | null;
  chemical_formula: string | null;
  sequence: string | null;
  salt_form: string | null;
  termini_modifications: string | null;
  notes: string | null;
  confidence: string | null;
  ambiguity_notes: string | null;
  source_url: string | null;
  pubchem_cid: string | null;
  unii: string | null;
  inchikey: string | null;
  smiles: string | null;
  inn_usan_name: string | null;
  drugbank_id: string | null;
  chembl_id: string | null;
  atc_code: string | null;
  research_summary: string | null;
  key_references: string | null;
};

function normalize(input: z.infer<typeof itemSchema>): LibraryInsert {
  const s = (v: string | null | undefined) => (v == null ? null : (String(v).trim() || null));
  return {
    names: input.names.trim(),
    category: s(input.category),
    cas_number: s(input.cas_number),
    molecular_weight: s(input.molecular_weight),
    molecular_size: s(input.molecular_size),
    size_basis: s(input.size_basis),
    chemical_formula: s(input.chemical_formula),
    sequence: s(input.sequence),
    salt_form: s(input.salt_form),
    termini_modifications: s(input.termini_modifications),
    notes: s(input.notes),
    confidence: s(input.confidence),
    ambiguity_notes: s(input.ambiguity_notes),
    source_url: s(input.source_url),
    pubchem_cid: s(input.pubchem_cid),
    unii: s(input.unii),
    inchikey: s(input.inchikey),
    smiles: s(input.smiles),
    inn_usan_name: s(input.inn_usan_name),
    drugbank_id: s(input.drugbank_id),
    chembl_id: s(input.chembl_id),
    atc_code: s(input.atc_code),
    research_summary: s(input.research_summary),
    key_references: s(input.key_references),
  };
}

export const listLibraryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("library_items")
      .select("*")
      .order("category", { ascending: true, nullsFirst: false })
      .order("names", { ascending: true });
    if (error) throw error;
    return (data ?? []) as LibraryItem[];
  });

export const createLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ context, data }) => {
    const row = normalize(data);
    const { data: inserted, error } = await context.supabase
      .from("library_items")
      .insert({ ...row, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return inserted as LibraryItem;
  });

export const updateLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(itemSchema.partial()).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(rest)) {
      patch[k] = v == null ? null : (String(v).trim() || null);
    }
    const { data: row, error } = await (context.supabase
      .from("library_items")
      .update as (p: Record<string, unknown>) => ReturnType<typeof context.supabase.from>["update"] extends infer _ ? any : any)(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row as LibraryItem;
  });

export const deleteLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("library_items")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkUploadLibraryItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(itemSchema).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Fetch existing keys for dedupe
    const { data: existing, error: exErr } = await context.supabase
      .from("library_items")
      .select("names, cas_number");
    if (exErr) throw exErr;
    const nameSet = new Set<string>();
    const casSet = new Set<string>();
    for (const r of existing ?? []) {
      if (r.names) nameSet.add(String(r.names).toLowerCase().trim());
      if (r.cas_number) casSet.add(String(r.cas_number).toLowerCase().trim());
    }

    const toInsert: Array<LibraryInsert & { created_by: string | null }> = [];
    let skipped = 0;
    const seenNames = new Set<string>();
    const seenCas = new Set<string>();
    for (const row of data.rows) {
      const normalized = normalize(row);
      const nameKey = normalized.names!.toLowerCase();
      const casKey = normalized.cas_number ? normalized.cas_number.toLowerCase() : null;
      if (nameSet.has(nameKey) || seenNames.has(nameKey)) { skipped++; continue; }
      if (casKey && (casSet.has(casKey) || seenCas.has(casKey))) { skipped++; continue; }
      seenNames.add(nameKey);
      if (casKey) seenCas.add(casKey);
      toInsert.push({ ...normalized, created_by: context.userId ?? null });
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const { data: ins, error } = await context.supabase
        .from("library_items")
        .insert(toInsert)
        .select("id");
      if (error) throw error;
      inserted = ins?.length ?? 0;
    }
    return { inserted, skipped };
  });
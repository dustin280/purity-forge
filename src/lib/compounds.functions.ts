import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Compound = {
  id: string;
  name: string;
  is_active: boolean;
  method_group_id: string | null;
  injection_volume_ul: number | null;
  sp_analyte_id: string | null;
  acquisition_method: string | null;
  processing_method: string | null;
  column_temperature_c: number | null;
  wavelength_nm: number | null;
  is_blend: boolean;
  default_diluent_name: string | null;
  cal_l1_mg_per_ml: number | null;
  cal_l2_mg_per_ml: number | null;
  cal_l3_mg_per_ml: number | null;
  cal_l4_mg_per_ml: number | null;
  cal_l5_mg_per_ml: number | null;
  cal_l6_mg_per_ml: number | null;
  /** Standard Prep-specific prep modification notes -- can legitimately differ from sample prep for the same compound. */
  sp_std_notes: string | null;
  /** Sample Prep-specific prep modification notes. */
  sp_smp_notes: string | null;
  /** For the partner certificate's identifier line ("CAS · formula"). Null prints the common name instead -- never guess one in. */
  cas_number: string | null;
  molecular_formula: string | null;
  /** Auto-fills a new sample's Physical Description at intake; always stays freely editable there and at review. */
  default_appearance: string | null;
  /** Market/shorthand names (e.g. "RETA", "SS31") that resolve to this compound -- exposed via the public compounds API for partner-side name matching. */
  aliases: string[] | null;
};

export type BlendComponent = {
  id: string;
  blend_id: string;
  component_id: string;
  component_name: string;
  nominal_amount_value: number | null;
  nominal_amount_unit: string | null;
  cal_l1_mg_per_ml: number | null;
  cal_l2_mg_per_ml: number | null;
  cal_l3_mg_per_ml: number | null;
  cal_l4_mg_per_ml: number | null;
  cal_l5_mg_per_ml: number | null;
  cal_l6_mg_per_ml: number | null;
  sort_order: number;
};

const COMPOUND_COLUMNS =
  "id, name, is_active, method_group_id, injection_volume_ul, sp_analyte_id, acquisition_method, processing_method, column_temperature_c, wavelength_nm, is_blend, default_diluent_name, cal_l1_mg_per_ml, cal_l2_mg_per_ml, cal_l3_mg_per_ml, cal_l4_mg_per_ml, cal_l5_mg_per_ml, cal_l6_mg_per_ml, sp_std_notes, sp_smp_notes, cas_number, molecular_formula, default_appearance, aliases";

export const listCompounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("compounds")
      .select(COMPOUND_COLUMNS)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Compound[];
  });

export const createCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(160).trim(), is_blend: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Case-insensitive duplicate check (unique index also enforces it).
    const { data: existing, error: lookupErr } = await supabase
      .from("compounds")
      .select(COMPOUND_COLUMNS)
      .ilike("name", data.name)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing) return existing as Compound;

    const { data: row, error } = await supabase
      .from("compounds")
      .insert({ name: data.name, is_blend: data.is_blend, created_by: userId })
      .select(COMPOUND_COLUMNS)
      .single();
    if (error) throw error;
    return row as Compound;
  });

const numOrNull = z.number().nullable().optional();

export const updateCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(160).trim().optional(),
        is_active: z.boolean().optional(),
        method_group_id: z.string().uuid().nullable().optional(),
        injection_volume_ul: z.number().min(0).max(100000).nullable().optional(),
        sp_analyte_id: z.string().uuid().nullable().optional(),
        acquisition_method: z.string().max(255).nullable().optional(),
        processing_method: z.string().max(255).nullable().optional(),
        column_temperature_c: numOrNull,
        wavelength_nm: numOrNull,
        is_blend: z.boolean().optional(),
        default_diluent_name: z.string().max(160).nullable().optional(),
        cal_l1_mg_per_ml: numOrNull,
        cal_l2_mg_per_ml: numOrNull,
        cal_l3_mg_per_ml: numOrNull,
        cal_l4_mg_per_ml: numOrNull,
        cal_l5_mg_per_ml: numOrNull,
        cal_l6_mg_per_ml: numOrNull,
        sp_std_notes: z.string().max(4000).nullable().optional(),
        sp_smp_notes: z.string().max(4000).nullable().optional(),
        cas_number: z.string().max(200).nullable().optional(),
        molecular_formula: z.string().max(500).nullable().optional(),
        default_appearance: z.string().max(200).nullable().optional(),
        aliases: z.array(z.string().max(100)).max(50).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("compounds")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCompound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("compounds")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Blend components ----------

export const listBlendComponents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ blend_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("compound_blend_components")
      .select("id, blend_id, component_id, nominal_amount_value, nominal_amount_unit, cal_l1_mg_per_ml, cal_l2_mg_per_ml, cal_l3_mg_per_ml, cal_l4_mg_per_ml, cal_l5_mg_per_ml, cal_l6_mg_per_ml, sort_order, compound:compounds!compound_blend_components_component_id_fkey(name)")
      .eq("blend_id", data.blend_id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    type RawRow = Omit<BlendComponent, "component_name"> & { compound: { name: string } | null };
    return ((rows ?? []) as unknown as RawRow[]).map((r) => ({
      id: r.id, blend_id: r.blend_id, component_id: r.component_id,
      nominal_amount_value: r.nominal_amount_value, nominal_amount_unit: r.nominal_amount_unit,
      cal_l1_mg_per_ml: r.cal_l1_mg_per_ml, cal_l2_mg_per_ml: r.cal_l2_mg_per_ml, cal_l3_mg_per_ml: r.cal_l3_mg_per_ml,
      cal_l4_mg_per_ml: r.cal_l4_mg_per_ml, cal_l5_mg_per_ml: r.cal_l5_mg_per_ml, cal_l6_mg_per_ml: r.cal_l6_mg_per_ml,
      sort_order: r.sort_order,
      component_name: r.compound?.name ?? "",
    }));
  });

export const upsertBlendComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().nullish(),
      blend_id: z.string().uuid(),
      component_id: z.string().uuid(),
      nominal_amount_value: numOrNull,
      nominal_amount_unit: z.string().max(20).nullable().optional(),
      cal_l1_mg_per_ml: numOrNull,
      cal_l2_mg_per_ml: numOrNull,
      cal_l3_mg_per_ml: numOrNull,
      cal_l4_mg_per_ml: numOrNull,
      cal_l5_mg_per_ml: numOrNull,
      cal_l6_mg_per_ml: numOrNull,
      sort_order: z.number().int().default(0),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...values } = data;
    if (id) {
      const { error } = await context.supabase.from("compound_blend_components").update(values).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("compound_blend_components")
      .insert(values)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteBlendComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("compound_blend_components").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

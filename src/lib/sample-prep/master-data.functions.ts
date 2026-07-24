/**
 * Server functions for Sample Prep master data: analytes, methods and revisions,
 * gradient / calibration / prep rules, vessels, equipment, solvents (formulations
 * + prepared lots), and shared calculation settings. Read for any authenticated
 * user; approved-record mutations and settings/deletes gated to admin via RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

// ---------- Types ----------
export interface Analyte {
  id: string;
  canonical_name: string;
  abbreviation: string | null;
  category: string | null;
  salt_form: string | null;
  cas_number: string | null;
  molecular_formula: string | null;
  molecular_weight: number | null;
  sequence: string | null;
  description: string | null;
  default_mass_unit: string | null;
  default_concentration_unit: string | null;
  default_solvent_recommendations: string | null;
  solubility_notes: string | null;
  stability_notes: string | null;
  storage_notes: string | null;
  handling_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyteAlias { id: string; analyte_id: string; alias: string }

export interface Method {
  id: string;
  analyte_id: string;
  code: string | null;
  name: string;
  method_type: string | null;
  intended_use: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RevisionStatus = "draft" | "under_review" | "approved" | "superseded" | "retired";

export interface MethodRevision {
  id: string;
  method_id: string;
  version: number;
  revision: number;
  status: RevisionStatus;
  effective_date: string | null;
  superseded_date: string | null;
  approval_date: string | null;
  change_reason: string | null;
  instrument_type: string | null;
  detector_type: string | null;
  wavelengths: Json;
  reference_wavelength: number | null;
  bandwidth: number | null;
  flow_rate: number | null;
  column_name: string | null;
  column_manufacturer: string | null;
  column_part_number: string | null;
  stationary_phase: string | null;
  particle_size_um: number | null;
  column_dimensions: string | null;
  column_temp_c: number | null;
  autosampler_temp_c: number | null;
  injection_volume_ul: number | null;
  needle_wash: string | null;
  seal_wash: string | null;
  total_run_time_min: number | null;
  post_run_time_min: number | null;
  estimated_rt_min: number | null;
  rt_window_min: number | null;
  expected_peak_order: string | null;
  suitability_requirements: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MobilePhase { id: string; revision_id: string; channel: "A"|"B"|"C"|"D"; composition_text: string | null; initial_percent: number | null }
export interface GradientStep { id: string; revision_id: string; ordinal: number; time_min: number | null; pct_a: number | null; pct_b: number | null; pct_c: number | null; pct_d: number | null; flow_rate: number | null; curve_type: string | null }
export interface CalibrationLevel { id: string; revision_id: string; level_number: number; standard_name: string | null; target_concentration: number | null; concentration_unit: string | null; preparation_source: string | null; dilution_factor: number | null; replicate_count: number | null; include_in_calibration: boolean; weighting_model: string | null; regression_model: string | null; acceptance_notes: string | null; is_active: boolean }
export interface PrepRules {
  revision_id: string;
  default_target_level: number;
  default_stock_concentration: number | null;
  default_stock_concentration_unit: string | null;
  preferred_initial_reconstitution_volume_ul: number | null;
  min_initial_reconstitution_volume_ul: number | null;
  max_initial_reconstitution_volume_ul: number | null;
  max_dilution_steps: number | null;
  preferred_final_volume_ul: number | null;
  min_pipette_volume_ul: number | null;
  preferred_min_pipette_volume_ul: number | null;
  max_pipette_volume_ul: number | null;
  max_concentration_deviation_pct: number | null;
  allow_direct: boolean;
  allow_serial: boolean;
  allow_gravimetric: boolean;
  allow_volumetric: boolean;
  mixing_instructions: string | null;
  sonication_instructions: string | null;
  centrifugation_instructions: string | null;
  filtration_instructions: string | null;
  filter_type: string | null;
  filter_pore_um: number | null;
  stability_notes: string | null;
  storage_temp_c: number | null;
  light_protection: boolean | null;
  max_hold_time: string | null;
  special_handling: string | null;
  safety_notes: string | null;
}

export interface Vessel { id: string; name: string; nominal_capacity_ul: number; min_working_volume_ul: number | null; max_working_volume_ul: number | null; material: string | null; graduated: boolean; volumetric: boolean; reusable: boolean; is_active: boolean; notes: string | null }
export interface Equipment { id: string; equipment_id: string | null; equipment_type: string; manufacturer: string | null; model: string | null; serial_number: string | null; min_capacity: number | null; max_capacity: number | null; capacity_unit: string | null; preferred_min: number | null; preferred_max: number | null; resolution: number | null; accuracy: string | null; uncertainty: string | null; calibration_status: string | null; calibration_date: string | null; calibration_due_date: string | null; location: string | null; is_active: boolean; notes: string | null }
export interface SolventFormulation { id: string; name: string; internal_code: string | null; version: string | null; storage_conditions: string | null; stability_period_days: number | null; approved_uses: string | null; status: "draft"|"approved"|"retired"; notes: string | null }
export interface SolventComponent { id: string; formulation_id: string; component_name: string; percentage: number | null; percentage_basis: "v/v"|"w/v"|"w/w"|"molar" | null; notes: string | null }
export interface ReagentLot { id: string; formulation_id: string; lot_number: string; preparation_date: string | null; expiration_date: string | null; final_volume: number | null; final_volume_unit: string | null; ph: number | null; review_status: "pending"|"approved"|"rejected"; notes: string | null }
export interface PrepSettings { absolute_min_pipette_ul: number; preferred_min_pipette_ul: number; default_calibration_levels: number; default_target_level: number; max_dilution_steps: number }

// ---------- Analytes ----------
const analyteInput = z.object({
  canonical_name: z.string().trim().min(1).max(200),
  abbreviation: z.string().trim().max(60).nullish(),
  category: z.string().trim().max(80).nullish(),
  salt_form: z.string().trim().max(120).nullish(),
  cas_number: z.string().trim().max(60).nullish(),
  molecular_formula: z.string().trim().max(200).nullish(),
  molecular_weight: z.number().nullish(),
  sequence: z.string().trim().max(4000).nullish(),
  description: z.string().trim().max(4000).nullish(),
  default_mass_unit: z.string().trim().max(20).nullish(),
  default_concentration_unit: z.string().trim().max(20).nullish(),
  default_solvent_recommendations: z.string().trim().max(500).nullish(),
  solubility_notes: z.string().trim().max(2000).nullish(),
  stability_notes: z.string().trim().max(2000).nullish(),
  storage_notes: z.string().trim().max(2000).nullish(),
  handling_notes: z.string().trim().max(2000).nullish(),
  is_active: z.boolean().optional(),
});

export const listAnalytes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sp_analytes").select("*").order("canonical_name");
    if (error) throw error;
    return (data ?? []) as Analyte[];
  });

export const getAnalyte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [analyte, aliases] = await Promise.all([
      context.supabase.from("sp_analytes").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("sp_analyte_aliases").select("*").eq("analyte_id", data.id).order("alias"),
    ]);
    if (analyte.error) throw analyte.error;
    if (aliases.error) throw aliases.error;
    return { analyte: analyte.data as Analyte | null, aliases: (aliases.data ?? []) as AnalyteAlias[] };
  });

export const createAnalyte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analyteInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("sp_analytes")
      .insert({ ...data, created_by: context.userId })
      .select("*").single();
    if (error) throw error;
    return row as Analyte;
  });

export const updateAnalyte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: analyteInput.partial() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_analytes").update(data.patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const addAnalyteAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ analyte_id: z.string().uuid(), alias: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_analyte_aliases").insert(data);
    if (error) throw error;
    return { ok: true };
  });

export const removeAnalyteAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_analyte_aliases").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Methods ----------
export const listMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [methods, revs, analytes] = await Promise.all([
      context.supabase.from("sp_methods").select("*").order("name"),
      context.supabase.from("sp_method_revisions").select("id,method_id,version,revision,status,effective_date,estimated_rt_min,column_name,updated_at").order("version", { ascending: false }).order("revision", { ascending: false }),
      context.supabase.from("sp_analytes").select("id,canonical_name").order("canonical_name"),
    ]);
    if (methods.error) throw methods.error;
    if (revs.error) throw revs.error;
    if (analytes.error) throw analytes.error;
    return {
      methods: (methods.data ?? []) as Method[],
      revisions: (revs.data ?? []) as Array<Partial<MethodRevision> & { id: string; method_id: string }>,
      analytes: (analytes.data ?? []) as Array<{ id: string; canonical_name: string }>,
    };
  });

export const createMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    analyte_id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().max(60).nullish(),
    method_type: z.string().trim().max(60).nullish(),
    intended_use: z.string().trim().max(500).nullish(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: method, error } = await context.supabase
      .from("sp_methods")
      .insert({ ...data, created_by: context.userId })
      .select("*").single();
    if (error) throw error;
    // seed initial revision + 6 calibration levels + empty prep rules
    const { data: rev, error: rerr } = await context.supabase
      .from("sp_method_revisions")
      .insert({ method_id: method.id, created_by: context.userId })
      .select("*").single();
    if (rerr) throw rerr;
    const levels = Array.from({ length: 6 }, (_, i) => ({ revision_id: rev.id, level_number: i + 1, standard_name: `Level ${i + 1}` }));
    const [levErr, prErr] = await Promise.all([
      context.supabase.from("sp_method_calibration_levels").insert(levels),
      context.supabase.from("sp_method_prep_rules").insert({ revision_id: rev.id }),
    ]);
    if (levErr.error) throw levErr.error;
    if (prErr.error) throw prErr.error;
    return { method: method as Method, revision: rev as MethodRevision };
  });

export const getMethod = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [method, revs] = await Promise.all([
      context.supabase.from("sp_methods").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("sp_method_revisions").select("*").eq("method_id", data.id).order("version", { ascending: false }).order("revision", { ascending: false }),
    ]);
    if (method.error) throw method.error;
    if (revs.error) throw revs.error;
    return { method: method.data as Method | null, revisions: (revs.data ?? []) as MethodRevision[] };
  });

export const getRevisionFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [rev, mp, grad, cal, pr] = await Promise.all([
      context.supabase.from("sp_method_revisions").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("sp_method_mobile_phases").select("*").eq("revision_id", data.id).order("channel"),
      context.supabase.from("sp_method_gradient_steps").select("*").eq("revision_id", data.id).order("ordinal"),
      context.supabase.from("sp_method_calibration_levels").select("*").eq("revision_id", data.id).order("level_number"),
      context.supabase.from("sp_method_prep_rules").select("*").eq("revision_id", data.id).maybeSingle(),
    ]);
    for (const r of [rev, mp, grad, cal, pr]) if (r.error) throw r.error;
    return {
      revision: rev.data as MethodRevision | null,
      mobile_phases: (mp.data ?? []) as MobilePhase[],
      gradient: (grad.data ?? []) as GradientStep[],
      calibration: (cal.data ?? []) as CalibrationLevel[],
      prep_rules: pr.data as PrepRules | null,
    };
  });

const revisionPatch = z.object({
  instrument_type: z.string().nullish(),
  detector_type: z.string().nullish(),
  reference_wavelength: z.number().nullish(),
  bandwidth: z.number().nullish(),
  flow_rate: z.number().nullish(),
  column_name: z.string().nullish(),
  column_manufacturer: z.string().nullish(),
  column_part_number: z.string().nullish(),
  stationary_phase: z.string().nullish(),
  particle_size_um: z.number().nullish(),
  column_dimensions: z.string().nullish(),
  column_temp_c: z.number().nullish(),
  autosampler_temp_c: z.number().nullish(),
  injection_volume_ul: z.number().nullish(),
  needle_wash: z.string().nullish(),
  seal_wash: z.string().nullish(),
  total_run_time_min: z.number().nullish(),
  post_run_time_min: z.number().nullish(),
  estimated_rt_min: z.number().nullish(),
  rt_window_min: z.number().nullish(),
  expected_peak_order: z.string().nullish(),
  suitability_requirements: z.string().nullish(),
  notes: z.string().nullish(),
  change_reason: z.string().nullish(),
  wavelengths: z.array(z.number()).nullish(),
}).partial();

export const updateRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: revisionPatch }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_method_revisions").update(data.patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setRevisionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["draft","under_review","approved","superseded","retired"]),
    change_reason: z.string().trim().max(500).nullish(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { status: data.status, change_reason: data.change_reason ?? null };
    if (data.status === "approved") {
      patch.approved_by = context.userId;
      patch.approval_date = new Date().toISOString();
    }
    const { data: existing, error: getErr } = await context.supabase.from("sp_method_revisions").select("method_id").eq("id", data.id).single();
    if (getErr) throw getErr;
    if (data.status === "approved" && existing) {
      await context.supabase.from("sp_method_revisions")
        .update({ status: "superseded", superseded_date: new Date().toISOString().slice(0,10) })
        .eq("method_id", existing.method_id).eq("status", "approved").neq("id", data.id);
    }
    const { error } = await context.supabase.from("sp_method_revisions").update(patch as never).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const createRevisionFrom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from_id: z.string().uuid(), bump: z.enum(["revision","version"]).default("revision") }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: src, error } = await context.supabase.from("sp_method_revisions").select("*").eq("id", data.from_id).single();
    if (error) throw error;
    const version = data.bump === "version" ? src.version + 1 : src.version;
    const revision = data.bump === "version" ? 0 : src.revision + 1;
    const { id: _id, created_at: _c, updated_at: _u, status: _s, approval_date: _a, approved_by: _ab, ...copy } = src as Record<string, unknown> & { id: string; created_at: string; updated_at: string; status: string; approval_date: string | null; approved_by: string | null };
    void _id; void _c; void _u; void _s; void _a; void _ab;
    const { data: newRev, error: cErr } = await context.supabase.from("sp_method_revisions")
      .insert({ ...copy, version, revision, status: "draft", approval_date: null, approved_by: null, created_by: context.userId } as never)
      .select("*").single();
    if (cErr) throw cErr;
    // clone children
    const [mp, grad, cal, pr] = await Promise.all([
      context.supabase.from("sp_method_mobile_phases").select("channel,composition_text,initial_percent").eq("revision_id", data.from_id),
      context.supabase.from("sp_method_gradient_steps").select("ordinal,time_min,pct_a,pct_b,pct_c,pct_d,flow_rate,curve_type").eq("revision_id", data.from_id),
      context.supabase.from("sp_method_calibration_levels").select("level_number,standard_name,target_concentration,concentration_unit,preparation_source,dilution_factor,replicate_count,include_in_calibration,weighting_model,regression_model,acceptance_notes,is_active").eq("revision_id", data.from_id),
      context.supabase.from("sp_method_prep_rules").select("*").eq("revision_id", data.from_id).maybeSingle(),
    ]);
    if (mp.data?.length) await context.supabase.from("sp_method_mobile_phases").insert(mp.data.map(r => ({ ...r, revision_id: newRev.id })));
    if (grad.data?.length) await context.supabase.from("sp_method_gradient_steps").insert(grad.data.map(r => ({ ...r, revision_id: newRev.id })));
    if (cal.data?.length) await context.supabase.from("sp_method_calibration_levels").insert(cal.data.map(r => ({ ...r, revision_id: newRev.id })));
    if (pr.data) {
      const { revision_id: _rid, created_at: _pc, updated_at: _pu, ...prCopy } = pr.data as Record<string, unknown> & { revision_id: string; created_at: string; updated_at: string };
      void _rid; void _pc; void _pu;
      await context.supabase.from("sp_method_prep_rules").insert({ ...prCopy, revision_id: newRev.id } as never);
    } else {
      await context.supabase.from("sp_method_prep_rules").insert({ revision_id: newRev.id });
    }
    return newRev as MethodRevision;
  });

// ---------- Gradient / Mobile Phases / Calibration / Prep Rules ----------
export const saveMobilePhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    revision_id: z.string().uuid(),
    rows: z.array(z.object({
      channel: z.enum(["A","B","C","D"]),
      composition_text: z.string().nullish(),
      initial_percent: z.number().nullish(),
    })),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase.from("sp_method_mobile_phases").delete().eq("revision_id", data.revision_id);
    if (data.rows.length) {
      const { error } = await context.supabase.from("sp_method_mobile_phases").insert(data.rows.map(r => ({ ...r, revision_id: data.revision_id })));
      if (error) throw error;
    }
    return { ok: true };
  });

export const saveGradient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    revision_id: z.string().uuid(),
    steps: z.array(z.object({
      time_min: z.number().nullish(),
      pct_a: z.number().nullish(),
      pct_b: z.number().nullish(),
      pct_c: z.number().nullish(),
      pct_d: z.number().nullish(),
      flow_rate: z.number().nullish(),
      curve_type: z.string().nullish(),
    })),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase.from("sp_method_gradient_steps").delete().eq("revision_id", data.revision_id);
    if (data.steps.length) {
      const rows = data.steps.map((s, i) => ({ ...s, ordinal: i + 1, revision_id: data.revision_id }));
      const { error } = await context.supabase.from("sp_method_gradient_steps").insert(rows);
      if (error) throw error;
    }
    return { ok: true };
  });

export const saveCalibration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    revision_id: z.string().uuid(),
    levels: z.array(z.object({
      level_number: z.number().int().min(1).max(20),
      standard_name: z.string().nullish(),
      target_concentration: z.number().nullish(),
      concentration_unit: z.string().nullish(),
      preparation_source: z.string().nullish(),
      dilution_factor: z.number().nullish(),
      replicate_count: z.number().nullish(),
      include_in_calibration: z.boolean().optional(),
      weighting_model: z.string().nullish(),
      regression_model: z.string().nullish(),
      acceptance_notes: z.string().nullish(),
      is_active: z.boolean().optional(),
    })),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase.from("sp_method_calibration_levels").delete().eq("revision_id", data.revision_id);
    if (data.levels.length) {
      const rows = data.levels.map(l => ({ ...l, revision_id: data.revision_id }));
      const { error } = await context.supabase.from("sp_method_calibration_levels").insert(rows);
      if (error) throw error;
    }
    return { ok: true };
  });

const prepRulesPatch = z.object({
  default_target_level: z.number().int().min(1).max(20).optional(),
  default_stock_concentration: z.number().nullish(),
  default_stock_concentration_unit: z.string().nullish(),
  preferred_initial_reconstitution_volume_ul: z.number().nullish(),
  min_initial_reconstitution_volume_ul: z.number().nullish(),
  max_initial_reconstitution_volume_ul: z.number().nullish(),
  max_dilution_steps: z.number().nullish(),
  preferred_final_volume_ul: z.number().nullish(),
  min_pipette_volume_ul: z.number().nullish(),
  preferred_min_pipette_volume_ul: z.number().nullish(),
  max_pipette_volume_ul: z.number().nullish(),
  max_concentration_deviation_pct: z.number().nullish(),
  allow_direct: z.boolean().optional(),
  allow_serial: z.boolean().optional(),
  allow_gravimetric: z.boolean().optional(),
  allow_volumetric: z.boolean().optional(),
  mixing_instructions: z.string().nullish(),
  sonication_instructions: z.string().nullish(),
  centrifugation_instructions: z.string().nullish(),
  filtration_instructions: z.string().nullish(),
  filter_type: z.string().nullish(),
  filter_pore_um: z.number().nullish(),
  stability_notes: z.string().nullish(),
  storage_temp_c: z.number().nullish(),
  light_protection: z.boolean().nullish(),
  max_hold_time: z.string().nullish(),
  special_handling: z.string().nullish(),
  safety_notes: z.string().nullish(),
}).partial();

export const savePrepRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ revision_id: z.string().uuid(), patch: prepRulesPatch }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_method_prep_rules").update(data.patch).eq("revision_id", data.revision_id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Vessels ----------
const vesselInput = z.object({
  name: z.string().trim().min(1).max(120),
  nominal_capacity_ul: z.number().positive(),
  min_working_volume_ul: z.number().nullish(),
  max_working_volume_ul: z.number().nullish(),
  material: z.string().trim().max(120).nullish(),
  graduated: z.boolean().optional(),
  volumetric: z.boolean().optional(),
  reusable: z.boolean().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().nullish(),
});

export const listVessels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("sp_vessels").select("*").order("nominal_capacity_ul");
    if (error) throw error;
    return (data ?? []) as Vessel[];
  });

export const upsertVessel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullish(), values: vesselInput }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.id) {
      const { error } = await context.supabase.from("sp_vessels").update(data.values).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("sp_vessels").insert(data.values).select("id").single();
    if (error) throw error;
    return { id: row.id as string };
  });

// ---------- Equipment ----------
const equipmentInput = z.object({
  equipment_id: z.string().trim().max(80).nullish(),
  equipment_type: z.string().trim().min(1).max(80),
  manufacturer: z.string().trim().max(120).nullish(),
  model: z.string().trim().max(120).nullish(),
  serial_number: z.string().trim().max(120).nullish(),
  min_capacity: z.number().nullish(),
  max_capacity: z.number().nullish(),
  capacity_unit: z.string().trim().max(20).nullish(),
  preferred_min: z.number().nullish(),
  preferred_max: z.number().nullish(),
  resolution: z.number().nullish(),
  accuracy: z.string().trim().max(120).nullish(),
  uncertainty: z.string().trim().max(120).nullish(),
  calibration_status: z.string().trim().max(60).nullish(),
  calibration_date: z.string().nullish(),
  calibration_due_date: z.string().nullish(),
  location: z.string().trim().max(120).nullish(),
  is_active: z.boolean().optional(),
  notes: z.string().nullish(),
});

export const listEquipment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("sp_equipment").select("*").order("equipment_type").order("model");
    if (error) throw error;
    return (data ?? []) as Equipment[];
  });

export const upsertEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullish(), values: equipmentInput }).parse(d))
  .handler(async ({ context, data }) => {
    const values = {
      ...data.values,
      calibration_date: data.values.calibration_date || null,
      calibration_due_date: data.values.calibration_due_date || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("sp_equipment").update(values).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("sp_equipment").insert(values).select("id").single();
    if (error) throw error;
    return { id: row.id as string };
  });

// ---------- Solvents ----------
const formulationInput = z.object({
  name: z.string().trim().min(1).max(200),
  internal_code: z.string().trim().max(80).nullish(),
  version: z.string().trim().max(40).nullish(),
  storage_conditions: z.string().trim().max(500).nullish(),
  stability_period_days: z.number().int().nullish(),
  approved_uses: z.string().trim().max(500).nullish(),
  notes: z.string().nullish(),
});

export const listSolventFormulations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [f, c] = await Promise.all([
      context.supabase.from("sp_solvent_formulations").select("*").order("name"),
      context.supabase.from("sp_solvent_formulation_components").select("*"),
    ]);
    if (f.error) throw f.error;
    if (c.error) throw c.error;
    return { formulations: (f.data ?? []) as SolventFormulation[], components: (c.data ?? []) as SolventComponent[] };
  });

export const createFormulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    values: formulationInput,
    components: z.array(z.object({
      component_name: z.string().trim().min(1),
      percentage: z.number().nullish(),
      percentage_basis: z.enum(["v/v","w/v","w/w","molar"]).nullish(),
      notes: z.string().nullish(),
    })).default([]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.from("sp_solvent_formulations")
      .insert({ ...data.values, created_by: context.userId })
      .select("*").single();
    if (error) throw error;
    if (data.components.length) {
      const { error: cErr } = await context.supabase.from("sp_solvent_formulation_components").insert(data.components.map(c => ({ ...c, formulation_id: row.id })));
      if (cErr) throw cErr;
    }
    return row as SolventFormulation;
  });

export const setFormulationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["draft","approved","retired"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_solvent_formulations").update({ status: data.status }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listReagentLots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formulation_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase.from("sp_reagent_lots").select("*").eq("formulation_id", data.formulation_id).order("preparation_date", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as ReagentLot[];
  });

export const createReagentLot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formulation_id: z.string().uuid(),
    lot_number: z.string().trim().min(1).max(80),
    preparation_date: z.string().nullish(),
    expiration_date: z.string().nullish(),
    final_volume: z.number().nullish(),
    final_volume_unit: z.string().nullish(),
    ph: z.number().nullish(),
    notes: z.string().nullish(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_reagent_lots").insert({ ...data, prepared_by: context.userId, preparation_date: data.preparation_date || null, expiration_date: data.expiration_date || null });
    if (error) throw error;
    return { ok: true };
  });

// ---------- Settings ----------
export const getPrepSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("sp_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw error;
    return (data ?? { absolute_min_pipette_ul: 10, preferred_min_pipette_ul: 20, default_calibration_levels: 6, default_target_level: 3, max_dilution_steps: 5 }) as PrepSettings;
  });

export const updatePrepSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    absolute_min_pipette_ul: z.number().positive(),
    preferred_min_pipette_ul: z.number().positive(),
    default_calibration_levels: z.number().int().min(1).max(20),
    default_target_level: z.number().int().min(1).max(20),
    max_dilution_steps: z.number().int().min(1).max(20),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("sp_settings").update({ ...data, updated_by: context.userId }).eq("id", true);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Dashboard counts ----------
export const getPrepCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [a, m, e, s, v] = await Promise.all([
      context.supabase.from("sp_analytes").select("id", { count: "exact", head: true }),
      context.supabase.from("sp_methods").select("id", { count: "exact", head: true }),
      context.supabase.from("sp_equipment").select("id", { count: "exact", head: true }),
      context.supabase.from("sp_solvent_formulations").select("id", { count: "exact", head: true }),
      context.supabase.from("sp_vessels").select("id", { count: "exact", head: true }),
    ]);
    return {
      analytes: a.count ?? 0,
      methods: m.count ?? 0,
      equipment: e.count ?? 0,
      solvents: s.count ?? 0,
      vessels: v.count ?? 0,
    };
  });
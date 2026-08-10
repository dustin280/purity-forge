/**
 * CRUD server functions for Tray configurations and their positions.
 * Admins manage layouts; all authenticated users can read (needed by
 * the run-list generator).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enumerateAllVialLocations, formatVialLocation, MAX_DRAWERS } from "@/lib/run-lists/vial-location";

export type TrayPositionStatus = "available" | "reserved" | "out_of_service";

export interface TrayConfig {
  id: string;
  name: string;
  notes: string | null;
  is_default: boolean;
  drawer_count: number;
  created_at: string;
  updated_at: string;
}

export interface TrayPosition {
  id: string;
  tray_config_id: string;
  position_code: string;
  drawer: string | null;
  row_label: string | null;
  col_num: number | null;
  is_ref_vial: boolean;
  status: TrayPositionStatus;
}

export const listTrayConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tray_configs").select("*").order("is_default", { ascending: false }).order("name");
    if (error) throw error;
    return (data ?? []) as unknown as TrayConfig[];
  });

export const getTrayConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: cfg, error } = await context.supabase
      .from("tray_configs").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!cfg) throw new Error("Tray config not found");
    const { data: pos, error: e2 } = await context.supabase
      .from("tray_positions").select("*")
      .eq("tray_config_id", data.id)
      .order("is_ref_vial", { ascending: true })
      .order("drawer", { ascending: true })
      .order("row_label", { ascending: true })
      .order("col_num", { ascending: true });
    if (e2) throw e2;
    return {
      config: cfg as unknown as TrayConfig,
      positions: (pos ?? []) as unknown as TrayPosition[],
    };
  });

export const updateTrayPositionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["available", "reserved", "out_of_service"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("tray_positions").update({ status: data.status }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const createTrayConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(1).max(120),
    notes: z.string().max(500).nullable().optional(),
    drawer_count: z.number().int().min(1).max(MAX_DRAWERS).default(MAX_DRAWERS),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: cfg, error } = await context.supabase
      .from("tray_configs")
      .insert({ name: data.name, notes: data.notes ?? null, drawer_count: data.drawer_count })
      .select().single();
    if (error) throw error;
    // Seed every valid vial location for this instrument's drawer count
    // (D1 through D<drawer_count>, both F/B trays, 54 positions each),
    // plus the separate Ref-1..5 reference-vial positions.
    type PosInsert = {
      tray_config_id: string;
      position_code: string;
      drawer: string | null;
      row_label: string | null;
      col_num: number | null;
      is_ref_vial: boolean;
    };
    const rows: PosInsert[] = enumerateAllVialLocations(data.drawer_count).map((loc) => ({
      tray_config_id: cfg.id,
      position_code: formatVialLocation(loc),
      drawer: `D${loc.drawer}${loc.tray}`,
      row_label: loc.column,
      col_num: loc.row,
      is_ref_vial: false,
    }));
    for (let i = 1; i <= 5; i++) {
      rows.push({
        tray_config_id: cfg.id, position_code: `Ref-${i}`,
        drawer: "Ref", row_label: null, col_num: null, is_ref_vial: true,
      });
    }
    const { error: e2 } = await context.supabase.from("tray_positions").insert(rows);
    if (e2) throw e2;
    return cfg as unknown as TrayConfig;
  });
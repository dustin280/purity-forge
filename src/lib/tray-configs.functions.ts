/**
 * CRUD server functions for Tray configurations and their positions.
 * Admins manage layouts; all authenticated users can read (needed by
 * the run-list generator).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrayPositionStatus = "available" | "reserved" | "out_of_service";

export interface TrayConfig {
  id: string;
  name: string;
  notes: string | null;
  is_default: boolean;
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
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: cfg, error } = await context.supabase
      .from("tray_configs").insert({ name: data.name, notes: data.notes ?? null }).select().single();
    if (error) throw error;
    // Seed the same 4-drawer x 54 + Ref 1-5 layout
    type PosInsert = {
      tray_config_id: string;
      position_code: string;
      drawer: string | null;
      row_label: string | null;
      col_num: number | null;
      is_ref_vial: boolean;
    };
    const rows: PosInsert[] = [];
    for (const d of ["D1F", "D2F", "D3F", "D4B"]) {
      for (const r of ["A", "B", "C", "D", "E", "F"]) {
        for (let c = 1; c <= 9; c++) {
          rows.push({
            tray_config_id: cfg.id, position_code: `${d}-${r}${c}`,
            drawer: d, row_label: r, col_num: c, is_ref_vial: false,
          });
        }
      }
    }
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
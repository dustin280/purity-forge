/**
 * Server functions specific to instrument inventory rows: list active
 * instruments, update instrument-only fields, and toggle operational status.
 * Regular inventory CRUD still lives in inventory.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InstrumentOpStatus = "active" | "maintenance" | "inactive";

export interface InstrumentInventoryItem {
  id: string;
  instrument_name: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  description: string | null;
  instrument_status: InstrumentOpStatus | null;
  default_method_folder: string | null;
  tray_config_id: string | null;
  drive_sequences_folder_id: string | null;
}

export const listInstrumentInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ active_only: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("inventory_items")
      .select("id,instrument_name,make,model,serial_number,description,instrument_status,default_method_folder,tray_config_id,drive_sequences_folder_id")
      .eq("category", "instrument");
    if (data.active_only) q = q.eq("instrument_status", "active");
    const { data: rows, error } = await q.order("instrument_name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as InstrumentInventoryItem[];
  });

export const updateInstrumentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    instrument_name: z.string().max(120).nullable().optional(),
    instrument_status: z.enum(["active", "maintenance", "inactive"]).nullable().optional(),
    default_method_folder: z.string().max(500).nullable().optional(),
    tray_config_id: z.string().uuid().nullable().optional(),
    drive_sequences_folder_id: z.preprocess((v) => {
      if (typeof v !== "string") return v;
      const s = v.trim();
      if (!s) return null;
      const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
      return m ? m[1] : s;
    }, z.string().max(200).regex(/^[A-Za-z0-9_-]+$/, "Invalid Drive folder ID").nullable().optional()),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("inventory_items").update(rest).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
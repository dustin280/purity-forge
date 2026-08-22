/**
 * CRUD server functions for storage units (fridges, freezers, incubators,
 * autoclaves) and their trays/slots — same admin-manages-layout,
 * everyone-can-read split as tray-configs.functions.ts, which this mirrors.
 * Autoclaves are a basic equipment registry entry only (no trays): callers
 * pass tray_count: null and no storage_slots rows get created for them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StorageUnitType = "fridge" | "freezer" | "incubator" | "autoclave";
export type StorageSlotStatus = "available" | "occupied" | "out_of_service";

export interface StorageUnit {
  id: string;
  unit_type: StorageUnitType;
  name: string;
  tray_count: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  is_active: boolean;
  notes: string | null;
  target_temperature_c: number | null;
  created_at: string;
  updated_at: string;
}

export interface StorageSlot {
  id: string;
  storage_unit_id: string;
  tray_number: number;
  label: string;
  status: StorageSlotStatus;
}

export const listStorageUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("storage_units").select("*").order("unit_type").order("name");
    if (error) throw error;
    return (data ?? []) as unknown as StorageUnit[];
  });

export const getStorageUnit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: unit, error } = await context.supabase
      .from("storage_units").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!unit) throw new Error("Storage unit not found");
    const { data: slots, error: e2 } = await context.supabase
      .from("storage_slots").select("*")
      .eq("storage_unit_id", data.id)
      .order("tray_number");
    if (e2) throw e2;
    return {
      unit: unit as unknown as StorageUnit,
      slots: (slots ?? []) as unknown as StorageSlot[],
    };
  });

export const createStorageUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    unit_type: z.enum(["fridge", "freezer", "incubator", "autoclave"]),
    name: z.string().min(1).max(120),
    tray_count: z.number().int().min(1).max(200).nullable().optional(),
    manufacturer: z.string().max(120).nullable().optional(),
    model: z.string().max(120).nullable().optional(),
    serial_number: z.string().max(120).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    target_temperature_c: z.number().min(-100).max(200).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const trayCount = data.unit_type === "autoclave" ? null : (data.tray_count ?? null);
    const { data: unit, error } = await context.supabase
      .from("storage_units")
      .insert({
        unit_type: data.unit_type,
        name: data.name,
        tray_count: trayCount,
        manufacturer: data.manufacturer ?? null,
        model: data.model ?? null,
        serial_number: data.serial_number ?? null,
        notes: data.notes ?? null,
        target_temperature_c: data.target_temperature_c ?? null,
      })
      .select().single();
    if (error) throw error;
    if (trayCount) {
      const rows = Array.from({ length: trayCount }, (_, i) => ({
        storage_unit_id: unit.id,
        tray_number: i + 1,
        label: `Tray ${i + 1}`,
      }));
      const { error: e2 } = await context.supabase.from("storage_slots").insert(rows);
      if (e2) throw e2;
    }
    return unit as unknown as StorageUnit;
  });

export const updateStorageUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    manufacturer: z.string().max(120).nullable().optional(),
    model: z.string().max(120).nullable().optional(),
    serial_number: z.string().max(120).nullable().optional(),
    is_active: z.boolean().optional(),
    notes: z.string().max(500).nullable().optional(),
    target_temperature_c: z.number().min(-100).max(200).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("storage_units").update(rest).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

/** Appends more trays to an existing unit — Dustin's "adding more trays" case
 * as units get replaced/upgraded. Continues the tray_number sequence past
 * whatever the highest existing tray_number is, so it's safe to call even
 * after trays have been individually added/removed over time. */
export const addStorageUnitTrays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    unit_id: z.string().uuid(),
    count: z.number().int().min(1).max(100),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("storage_slots").select("tray_number")
      .eq("storage_unit_id", data.unit_id)
      .order("tray_number", { ascending: false })
      .limit(1);
    if (e1) throw e1;
    const startAt = (existing?.[0]?.tray_number ?? 0) + 1;
    const rows = Array.from({ length: data.count }, (_, i) => ({
      storage_unit_id: data.unit_id,
      tray_number: startAt + i,
      label: `Tray ${startAt + i}`,
    }));
    const { error: e2 } = await context.supabase.from("storage_slots").insert(rows);
    if (e2) throw e2;
    const { data: unit, error: e3 } = await context.supabase
      .from("storage_units").select("tray_count").eq("id", data.unit_id).maybeSingle();
    if (e3) throw e3;
    await context.supabase.from("storage_units")
      .update({ tray_count: (unit?.tray_count ?? startAt - 1) + data.count })
      .eq("id", data.unit_id);
    return { ok: true };
  });

/** Flat list of open trays of one unit type, across all active units —
 * feeds the manual "Assign"/"Move" picker on a sample's Info tab. */
export const listAvailableSlotsByType = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    unitType: z.enum(["fridge", "freezer", "incubator"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("storage_slots")
      .select("id, label, storage_units!inner(name, unit_type, is_active)")
      .eq("status", "available")
      .eq("storage_units.unit_type", data.unitType)
      .eq("storage_units.is_active", true);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      label: `${(r.storage_units as unknown as { name: string }).name} / ${r.label as string}`,
    }));
  });

export const updateStorageSlotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["available", "occupied", "out_of_service"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("storage_slots").update({ status: data.status }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

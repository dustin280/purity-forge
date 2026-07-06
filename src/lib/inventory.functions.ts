/**
 * Server functions for the inventory module: list and create inventory items
 * (instruments, columns, accessories, other) with optional sub-components.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InventoryCategory = "instrument" | "column" | "accessory" | "other";
export type InventoryStatus = "in_service" | "out_of_service" | "discarded";

export interface InventoryComponent {
  id: string;
  item_id: string;
  make: string | null;
  model: string | null;
  part_number: string | null;
  serial_number: string | null;
  description: string | null;
  purchase_date: string | null;
  installation_date: string | null;
  installer_initials: string | null;
  status: InventoryStatus;
  position: number;
  is_spare: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  make: string | null;
  model: string | null;
  part_number: string | null;
  serial_number: string | null;
  description: string | null;
  purchase_date: string | null;
  installation_date: string | null;
  installer_initials: string | null;
  status: InventoryStatus;
  is_spare: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  components: InventoryComponent[];
}

const statusEnum = z.enum(["in_service", "out_of_service", "discarded"]);
const categoryEnum = z.enum(["instrument", "column", "accessory", "other"]);

const baseFields = {
  make: z.string().trim().max(120).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  part_number: z.string().trim().max(120).optional().nullable(),
  serial_number: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  purchase_date: z.string().trim().min(1).max(20).optional().nullable(),
  installation_date: z.string().trim().min(1).max(20).optional().nullable(),
  installer_initials: z.string().trim().max(10).optional().nullable(),
  status: statusEnum.default("in_service"),
  is_spare: z.boolean().optional().default(false),
};

const createSchema = z.object({
  category: categoryEnum,
  ...baseFields,
  components: z
    .array(z.object(baseFields))
    .max(50)
    .optional()
    .default([]),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  ...baseFields,
  components: z
    .array(z.object({ id: z.string().uuid().optional(), ...baseFields }))
    .max(50)
    .optional()
    .default([]),
});

const idSchema = z.object({ id: z.string().uuid() });

function normalize<T extends Record<string, unknown>>(o: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: items, error } = await context.supabase
      .from("inventory_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (items ?? []).map(i => i.id);
    let components: InventoryComponent[] = [];
    if (ids.length) {
      const { data: comps, error: cErr } = await context.supabase
        .from("inventory_components")
        .select("*")
        .in("item_id", ids)
        .order("position", { ascending: true });
      if (cErr) throw cErr;
      components = (comps ?? []) as unknown as InventoryComponent[];
    }
    return (items ?? []).map(it => ({
      ...(it as unknown as InventoryItem),
      components: components.filter(c => c.item_id === it.id),
    }));
  });

export const createInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { components, category, ...rest } = data;
    const itemPayload = normalize({ category, ...rest, created_by: context.userId });
    const { data: inserted, error } = await context.supabase
      .from("inventory_items")
      .insert(itemPayload as never)
      .select()
      .single();
    if (error) throw error;
    const item = inserted as unknown as InventoryItem;
    if ((category === "instrument" || category === "other") && components && components.length) {
      const rows = components.map((c, idx) => normalize({ ...c, item_id: item.id, position: idx }));
      const { error: cErr } = await context.supabase.from("inventory_components").insert(rows as never);
      if (cErr) throw cErr;
    }
    return { id: item.id };
  });

export const getInventoryItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: item, error } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: comps, error: cErr } = await context.supabase
      .from("inventory_components")
      .select("*")
      .eq("item_id", data.id)
      .order("position", { ascending: true });
    if (cErr) throw cErr;
    return {
      ...(item as unknown as InventoryItem),
      components: (comps ?? []) as unknown as InventoryComponent[],
    };
  });

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, components, ...rest } = data;
    const itemPayload = normalize({ ...rest, updated_at: new Date().toISOString() });
    const { error } = await context.supabase
      .from("inventory_items")
      .update(itemPayload as never)
      .eq("id", id);
    if (error) throw error;

    // Reconcile components: delete removed, upsert remaining (preserves ids).
    const { data: existing, error: eErr } = await context.supabase
      .from("inventory_components")
      .select("id")
      .eq("item_id", id);
    if (eErr) throw eErr;
    const keepIds = new Set(
      (components ?? []).map(c => c.id).filter((x): x is string => !!x),
    );
    const toDelete = (existing ?? [])
      .map(r => (r as { id: string }).id)
      .filter(eid => !keepIds.has(eid));
    if (toDelete.length) {
      const { error: dErr } = await context.supabase
        .from("inventory_components")
        .delete()
        .in("id", toDelete);
      if (dErr) throw dErr;
    }
    for (let i = 0; i < (components ?? []).length; i++) {
      const c = components![i];
      const payload = normalize({
        ...c, item_id: id, position: i, updated_at: new Date().toISOString(),
      });
      if (c.id) {
        const { error: uErr } = await context.supabase
          .from("inventory_components")
          .update(payload as never)
          .eq("id", c.id);
        if (uErr) throw uErr;
      } else {
        const { id: _omit, ...insertPayload } = payload as { id?: string } & Record<string, unknown>;
        const { error: iErr } = await context.supabase
          .from("inventory_components")
          .insert(insertPayload as never);
        if (iErr) throw iErr;
      }
    }
    return { id };
  });
/**
 * Server functions for the inventory module: list and create inventory items
 * (instruments, columns, accessories, other) with optional sub-components.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InventoryCategory = "instrument" | "column" | "accessory" | "other";
export type InventoryStatus = "in_use" | "working_not_in_use" | "discarded";

export interface InventoryComponent {
  id: string;
  item_id: string;
  make: string | null;
  model: string | null;
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

const statusEnum = z.enum(["in_use", "working_not_in_use", "discarded"]);
const categoryEnum = z.enum(["instrument", "column", "accessory", "other"]);

const baseFields = {
  make: z.string().trim().max(120).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  serial_number: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  purchase_date: z.string().trim().min(1).max(20).optional().nullable(),
  installation_date: z.string().trim().min(1).max(20).optional().nullable(),
  installer_initials: z.string().trim().max(10).optional().nullable(),
  status: statusEnum.default("in_use"),
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
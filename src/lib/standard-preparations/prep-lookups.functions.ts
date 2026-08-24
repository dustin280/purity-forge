/**
 * Read-only lookup server functions used by the prep form (standard
 * suggestions, linkable material receipts, preps already linked to a receipt).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PrepStatus } from "./prep-shared.server";

export const listStandardSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("standard_suggestions")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      name: string;
      typical_concentration: string | null;
      typical_solvent: string | null;
    }>;
  });

export const searchMaterialReceiptsForLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    q: z.string().nullable().optional(),
    approved_only: z.boolean().optional(),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("material_receipts")
      .select("id, receipt_number, internal_lot, manufacturer_lot, material_name, received_at, purity_percent, molecular_weight, shelf_life_months, expiry_date, approved_at, quarantine_status")
      .order("received_at", { ascending: false })
      .limit(20);
    if (data.approved_only) {
      q = q.not("approved_at", "is", null).eq("quarantine_status", "released");
    }
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(
        [
          `receipt_number.ilike.${term}`,
          `material_name.ilike.${term}`,
          `internal_lot.ilike.${term}`,
          `manufacturer_lot.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listPrepsForReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ receipt_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("standard_preparation_logs")
      .select("id, log_number, batch_group_id, standard_name, analyst_name, prepared_at, expiration_date, status")
      .eq("material_receipt_id", data.receipt_id)
      .order("prepared_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      log_number: string;
      batch_group_id: string | null;
      standard_name: string;
      analyst_name: string;
      prepared_at: string;
      expiration_date: string | null;
      status: PrepStatus;
    }>;
  });
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MaterialType } from "./receipts-shared.server";

export const listMaterialSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("material_suggestions")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Array<{
      id: string;
      material_type: MaterialType;
      name: string;
      manufacturer: string | null;
      catalog_number: string | null;
    }>;
  });
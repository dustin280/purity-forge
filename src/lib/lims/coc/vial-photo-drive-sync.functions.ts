/**
 * Thin client-safe wrapper around vial-photo-drive-sync.server.ts.
 * The implementation imports @cf-wasm/photon (a WASM module that only
 * loads in the workerd runtime), so it must never enter the client graph —
 * it is pulled in with a dynamic import inside the server-side callers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface VialPhotoSyncResult {
  ok: boolean;
  reason?: string;
  drive_file_id?: string;
  drive_file_name?: string;
}

export const syncVialPhotoToReportsDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sample_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<VialPhotoSyncResult> => {
    const { data: sample, error } = await context.supabase
      .from("samples")
      .select("batch_id, coc_id, line_item_index")
      .eq("id", data.sample_id)
      .maybeSingle();
    if (error || !sample) return { ok: false, reason: "sample not found" };
    const impl = await import("@/lib/lims/coc/vial-photo-drive-sync.server");
    return impl.pushVialPhotoToReportsDrive(context.supabase, sample);
  });

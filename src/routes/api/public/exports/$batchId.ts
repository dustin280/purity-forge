import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPartnerExportPayload } from "@/lib/lims/partner-export.functions";

export const Route = createFileRoute("/api/public/exports/$batchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const apiKey = request.headers.get("x-api-key");
        const { data: cfg } = await supabaseAdmin.from("export_config").select("*").limit(1).maybeSingle();
        if (!cfg || !cfg.is_active) {
          return new Response("Export disabled", { status: 403 });
        }
        if (!apiKey || apiKey !== cfg.api_key) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Look up by internal batch_id first, then by the partner/customer
        // lot number. Partner sites (synthesyx.com) poll this endpoint by the
        // lot they submitted via /api/public/orders/intake (samples[].lotBatch),
        // which the Sample Receipt flow stores in samples.lot — batch_id is
        // lab-internal and unknown to them.
        let { data: sample } = await supabaseAdmin.from("samples")
          .select("*").eq("batch_id", params.batchId).maybeSingle();
        if (!sample) {
          const { data: byLot } = await supabaseAdmin.from("samples")
            .select("*").eq("lot", params.batchId)
            .order("created_at", { ascending: false }).limit(1);
          sample = byLot?.[0] ?? null;
        }
        if (!sample) return new Response("Not found", { status: 404 });
        // No blanket "sample not approved" gate here anymore -- sterility/
        // endotoxin/heavy-metals results (including the day3/day7 sterility
        // checkpoints) already have no in-app review step of their own and
        // are explicitly meant to reach the partner before the sample's
        // purity work is done. Purity itself stays gated per-result on
        // approved_at instead (see buildPartnerExportPayload), so an
        // unreviewed purity number never leaks out just because sterility
        // finished first.
        const payload = await buildPartnerExportPayload(supabaseAdmin, sample, cfg);

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
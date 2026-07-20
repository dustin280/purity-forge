import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STATUS_LABEL, STATUS_PERCENT, type SampleStatus } from "@/lib/lims-utils";

export const Route = createFileRoute("/api/public/status/$batchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const apiKey = request.headers.get("x-api-key");
        const { data: cfg } = await supabaseAdmin
          .from("export_config").select("*").limit(1).maybeSingle();
        if (!cfg || !cfg.is_active) {
          return new Response("Export disabled", { status: 403 });
        }
        if (!apiKey || apiKey !== cfg.api_key) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: sample } = await supabaseAdmin.from("samples")
          .select("id,batch_id,client,project,receipt_date,due_date,status,updated_at,created_at")
          .eq("batch_id", params.batchId).maybeSingle();
        if (!sample) return new Response("Not found", { status: 404 });

        const { data: audit } = await supabaseAdmin.from("audit_log")
          .select("action,changed_at")
          .eq("table_name", "samples")
          .eq("record_id", sample.id)
          .like("action", "status_change:%")
          .order("changed_at", { ascending: true });

        const history = (audit ?? []).map(r => ({
          stage: r.action.replace(/^status_change:/, "") as SampleStatus,
          at: r.changed_at,
        })).filter(h => h.stage in STATUS_LABEL);

        const stage = sample.status as SampleStatus;
        const payload = {
          batch_id: sample.batch_id,
          client: sample.client,
          project: sample.project,
          received_at: sample.receipt_date,
          due_date: (sample as { due_date?: string | null }).due_date ?? null,
          stage,
          stage_label: STATUS_LABEL[stage] ?? stage,
          stage_percent: STATUS_PERCENT[stage] ?? null,
          history,
          approved: stage === "approved",
          results_available: stage === "approved",
          updated_at: (sample as { updated_at?: string }).updated_at ?? sample.created_at,
          generated_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
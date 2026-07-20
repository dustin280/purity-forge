import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STATUS_LABEL, STATUS_PERCENT, type SampleStatus } from "@/lib/lims-utils";

export const Route = createFileRoute("/api/public/status/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        const { data: cfg } = await supabaseAdmin
          .from("export_config").select("*").limit(1).maybeSingle();
        if (!cfg || !cfg.is_active) return new Response("Export disabled", { status: 403 });
        if (!apiKey || apiKey !== cfg.api_key) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const client = url.searchParams.get("client");
        const since = url.searchParams.get("since");
        const cursor = url.searchParams.get("cursor");
        const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 200);

        let q = supabaseAdmin.from("samples")
          .select("id,batch_id,client,project,receipt_date,due_date,status,updated_at")
          .order("updated_at", { ascending: false })
          .limit(limit + 1);
        if (client) q = q.eq("client", client);
        if (since) q = q.gte("updated_at", since);
        if (cursor) q = q.lt("updated_at", cursor);

        const { data, error } = await q;
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });

        const rows = data ?? [];
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? page[page.length - 1].updated_at : null;

        const samples = page.map(s => {
          const stage = s.status as SampleStatus;
          return {
            batch_id: s.batch_id,
            client: s.client,
            project: s.project,
            received_at: s.receipt_date,
            due_date: s.due_date,
            stage,
            stage_label: STATUS_LABEL[stage] ?? stage,
            stage_percent: STATUS_PERCENT[stage] ?? null,
            approved: stage === "approved",
            results_available: stage === "approved",
            updated_at: s.updated_at,
          };
        });

        return new Response(JSON.stringify({
          samples,
          next_cursor: nextCursor,
          generated_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
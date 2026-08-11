import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runReconciliation } from "@/lib/results/report-reconciliation.functions";

// Hit hourly by Supabase pg_cron (see the report-reconciliation migration's
// trigger_report_reconciliation()) — no user session exists here, so auth
// is a shared secret (sp_settings.cron_secret) rather than requireSupabaseAuth.
export const Route = createFileRoute("/api/cron/reconcile-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { data: settings } = await supabaseAdmin.from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || !provided || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runReconciliation({ supabase: supabaseAdmin, autoApply: true });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

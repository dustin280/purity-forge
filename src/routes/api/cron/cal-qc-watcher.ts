import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runCalQcWatcher } from "@/lib/lab-logs/cal-qc-watcher.functions";

// Hit hourly by Supabase pg_cron (see the cal-qc-watcher migration's
// trigger_cal_qc_watcher()) — no user session exists here, so auth is the
// same shared secret used by reconcile-reports.ts and pressure-log.ts
// (sp_settings.cron_secret).
export const Route = createFileRoute("/api/cron/cal-qc-watcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { data: settings } = await supabaseAdmin.from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || !provided || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runCalQcWatcher({ supabase: supabaseAdmin });
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

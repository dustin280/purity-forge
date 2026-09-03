import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runPressureWatcher } from "@/lib/lab-logs/pressure-watcher.functions";

// Hit hourly by Supabase pg_cron (see the pressure-watcher migration's
// trigger_pressure_log_watcher()) — no user session exists here, so auth
// is the same shared secret used by reconcile-reports.ts (sp_settings.cron_secret).
export const Route = createFileRoute("/api/cron/pressure-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { data: settings } = await supabaseAdmin.from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || !provided || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runPressureWatcher({ supabase: supabaseAdmin });
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

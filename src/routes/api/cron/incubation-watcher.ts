import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIncubationWatcher } from "@/lib/lims/incubation-watcher.functions";

// Hit hourly by Supabase pg_cron (see trigger_incubation_watcher() in the
// sterility_preps migration) — no user session exists here, so auth is a
// shared secret (sp_settings.cron_secret), same shape as reconcile-reports.ts.
export const Route = createFileRoute("/api/cron/incubation-watcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { data: settings } = await supabaseAdmin.from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || !provided || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runIncubationWatcher(supabaseAdmin);
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

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runDailyDigest } from "@/lib/notifications/daily-digest.functions";

// Hit daily at 7am PST by Supabase pg_cron (see trigger_daily_digest() in
// the daily_digest_cron migration) — no user session exists here, same
// x-cron-secret shape as incubation-watcher.ts/reconcile-reports.ts.
// POST /api/cron/daily-digest?dryRun=1 computes every subscribed
// recipient's sections and returns them as JSON instead of sending —
// safe to hit manually to verify the category queries against real data.
export const Route = createFileRoute("/api/cron/daily-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const { data: settings } = await supabaseAdmin.from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || !provided || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
        try {
          const result = await runDailyDigest(supabaseAdmin, { dryRun });
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

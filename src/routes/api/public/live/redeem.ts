import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import { redeemPublicLiveCode } from "@/lib/public-live.server";

/**
 * Public: exchange a one-time passcode for a 12-hour viewer token. No user
 * session exists here; the code itself is the credential (see
 * public-live.server.ts). Answers 400/404/410 with a plain message the page
 * can show, 200 with { token, session } once.
 */
export const Route = createFileRoute("/api/public/live/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let code = "";
        try {
          const body = (await request.json()) as { code?: unknown };
          if (typeof body?.code === "string") code = body.code;
        } catch {
          return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
        }
        try {
          const res = await redeemPublicLiveCode(supabaseAdmin as AnySupabase, code);
          if (!res.ok)
            return Response.json({ ok: false, error: res.error }, { status: res.status });
          return Response.json(
            { ok: true, token: res.token, session: res.session },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (e) {
          console.error("[public/live/redeem]", e);
          return Response.json(
            { ok: false, error: "Could not redeem the passcode" },
            { status: 500 },
          );
        }
      },
    },
  },
});

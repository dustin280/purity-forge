import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AnySupabase } from "@/lib/non-conformity/supabase-any";
import { buildPublicLiveSnapshot, verifyPublicLiveToken } from "@/lib/public-live.server";

/**
 * Public: what the /live page polls. `Authorization: Bearer <token>` from
 * /api/public/live/redeem; query: instrument (id), streams (comma list),
 * since (ISO cursor from the previous snapshot), history=1 to load the cached
 * hour instead of just new rows. 401 when the token is unknown, expired or
 * revoked — the page then asks for a passcode again.
 */
export const Route = createFileRoute("/api/public/live/snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        const db = supabaseAdmin as AnySupabase;
        const session = token ? await verifyPublicLiveToken(db, token) : null;
        if (!session) {
          return Response.json(
            { ok: false, error: "Access expired" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }
        const url = new URL(request.url);
        const instrumentId = url.searchParams.get("instrument");
        const streams = (url.searchParams.get("streams") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const since = url.searchParams.get("since");
        const history = url.searchParams.get("history") === "1";
        try {
          const snapshot = await buildPublicLiveSnapshot(db, session, {
            instrumentId:
              instrumentId && /^[0-9a-f-]{36}$/i.test(instrumentId) ? instrumentId : null,
            streams,
            since: since && !Number.isNaN(new Date(since).getTime()) ? since : null,
            history,
          });
          return Response.json(
            { ok: true, ...snapshot },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (e) {
          console.error("[public/live/snapshot]", e);
          return Response.json(
            { ok: false, error: "Could not read the live feed" },
            { status: 500 },
          );
        }
      },
    },
  },
});

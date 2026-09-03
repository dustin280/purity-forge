import { createFileRoute } from "@tanstack/react-router";
import {
  touchInstrumentFeedKey,
  verifyInstrumentFeedRequest,
} from "@/lib/instrument-feed-auth.server";
import { feedEventSchema, processFeedEvent } from "@/lib/instrument-feed.server";

/**
 * Lifecycle events from the on-prem instrument agent: heartbeat,
 * sequence_started, run_started, run_completed (carries the decoded per-run
 * traces + summary and produces the Daily Backpressure row), and
 * sequence_completed. Same auth as /api/instrument/feed.
 */
export const Route = createFileRoute("/api/instrument/event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const auth = await verifyInstrumentFeedRequest(request, body);
        if (!auth) return new Response("Invalid signature", { status: 401 });

        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const parsed = feedEventSchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 10) },
            { status: 400 },
          );
        }

        try {
          const result = await processFeedEvent(auth.instrumentId, parsed.data);
          await touchInstrumentFeedKey(auth.keyId, parsed.data.agent);
          return Response.json(result);
        } catch (e) {
          console.error("[instrument/event] processing failed", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});

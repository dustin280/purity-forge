import { createFileRoute } from "@tanstack/react-router";
import {
  touchInstrumentFeedKey,
  verifyInstrumentFeedRequest,
} from "@/lib/instrument-feed-auth.server";
import { feedBatchSchema, processFeedBatch } from "@/lib/instrument-feed.server";

/**
 * Live sample batches from the on-prem instrument agent (about one per
 * second per instrument while it is powered on). Auth: `x-instrument-id` +
 * `x-signature` (HMAC-SHA256 of the raw body under an active
 * instrument_feed_keys secret). See src/lib/instrument-feed.server.ts.
 */
export const Route = createFileRoute("/api/instrument/feed")({
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
        const parsed = feedBatchSchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 10) },
            { status: 400 },
          );
        }

        try {
          await processFeedBatch(auth.instrumentId, parsed.data);
        } catch (e) {
          console.error("[instrument/feed] processing failed", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
        // Once a minute is plenty for "last seen" on a 1 Hz stream.
        if (parsed.data.batch_seq % 60 === 0)
          await touchInstrumentFeedKey(auth.keyId, parsed.data.agent);
        return Response.json({ ok: true });
      },
    },
  },
});

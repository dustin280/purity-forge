import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, getLovableAiGatewayRunId } from "@/lib/ai-gateway.server";
import { catalogForPrompt } from "@/lib/maintenance/columns";

export const Route = createFileRoute("/api/chat-column-advisor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as { messages?: unknown };
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(key, initialRunId);
        const model = gateway("google/gemini-3-flash-preview");

        const system = `You are an expert HPLC/UHPLC column-selection advisor.
You help analytical chemists pick the right column for their application across multiple vendors (currently Agilent and Waters).

RULES:
- ONLY recommend columns from the catalog below (use the exact Part Number, "PN=..."). Each row is tagged with its vendor in brackets, e.g. "[Agilent]" or "[Waters]".
- If the user has not told you enough, ask 1-2 concise clarifying questions first (analytes / polarity / MW range, mobile phase pH, ionic vs neutral, instrument max pressure, sample matrix, throughput, scale, vendor preference if any).
- When you recommend, give up to 3 ranked picks. For each: bold the Part Number and name the vendor, then 1-2 sentences on why it fits (chemistry, particle size vs pressure, ID/length vs throughput/sensitivity, pore size vs MW). Where useful, suggest one pick from each vendor for comparison.
- Mention the matching guard column part number if available.
- Format with concise markdown.

CATALOG (columns available to recommend, grouped by vendor):
${catalogForPrompt()}`;

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
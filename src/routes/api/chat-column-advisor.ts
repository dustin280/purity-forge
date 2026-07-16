import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, getLovableAiGatewayRunId } from "@/lib/ai-gateway.server";
import { catalogForPrompt } from "@/lib/maintenance/columns";
import { advisorTools } from "@/lib/ai-agent-tools.server";

export const Route = createFileRoute("/api/chat-column-advisor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: unknown; prioritizeCatalog?: boolean };
        const { messages } = body;
        const prioritizeCatalog = body.prioritizeCatalog !== false; // default ON
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(key, initialRunId);
        const model = gateway("google/gemini-3-flash-preview");

        const catalogPolicy = prioritizeCatalog
          ? `PREFER columns from the SAVED CATALOG below. Only suggest off-catalog columns from the web when no catalog entry is a good fit, or when the user explicitly asks. Always call \`lookupCatalog\` first when the user supplies a part number.`
          : `Treat the saved catalog and the wider market as equal sources. Recommend whatever genuinely fits best, regardless of whether it's in the saved catalog.`;

        const system = `You are an expert HPLC/UHPLC column-selection advisor with full freedom across all vendors and chemistries.

You have these tools:
- \`searchKnowledgeBase\`: search the lab's uploaded reference PDFs (vendor column guides, application notes, selection handbooks). CALL THIS FIRST for any chemistry/selectivity/application question; cite hits inline as (Doc Title) — do NOT invent page numbers; page metadata is not tracked.
- \`lookupCatalog\`: check if a part number is in the user's saved catalog.
- \`searchWeb\`: search the public web (vendor pages, spec sheets, distributors, forums) — use this whenever the catalog doesn't have what you need, or to verify a recent part number / spec.
- \`scrapePage\`: read a specific URL in detail after a search.
- \`proposeCatalogAddition\`: when you recommend a legitimate off-catalog column with a known vendor part number, call this so the user can save it back to their catalog with one click.

CATALOG POLICY: ${catalogPolicy}

RULES:
- If the user has not told you enough, ask 1–2 concise clarifying questions first (analytes / polarity / MW range, mobile phase pH, ionic vs neutral, instrument max pressure, sample matrix, throughput, scale, vendor preference).
- When recommending, give up to 3 ranked picks. For each: bold the Part Number, name the vendor, and TAG IT as either \`[In Catalog]\` or \`[Off-Catalog · web]\` with the source URL. Then 1–2 sentences on why it fits (chemistry, particle size vs pressure, ID/length vs throughput/sensitivity, pore size vs MW).
- Mention the matching guard column part number if available.
- For unknown part numbers the user pastes, ALWAYS call \`lookupCatalog\` first; if not found, call \`searchWeb\` to identify it before answering.
- After recommending an off-catalog column, call \`proposeCatalogAddition\` so the user can save it.
- Format with concise markdown.

SAVED CATALOG (grouped by vendor):
${catalogForPrompt()}`;

        const result = streamText({
          model,
          system,
          tools: advisorTools,
          stopWhen: stepCountIs(50),
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onError: (error) => {
            const msg = error instanceof Error ? error.message : String(error);
            if (/402/.test(msg)) return "AI credits exhausted. Top up to continue.";
            if (/429/.test(msg)) return "Rate limit hit — please retry in a moment.";
            return msg || "Stream error";
          },
        });
      },
    },
  },
});
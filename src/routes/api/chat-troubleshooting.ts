import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, getLovableAiGatewayRunId } from "@/lib/ai-gateway.server";
import { troubleshootingTools } from "@/lib/ai-agent-tools.server";

export const Route = createFileRoute("/api/chat-troubleshooting")({
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

        const system = `You are an expert HPLC/UHPLC troubleshooting assistant for analytical chemists and lab technicians.

You diagnose two broad classes of problems:
1. ANALYSIS / CHROMATOGRAPHY issues — peak shape (tailing, fronting, splitting, shoulders, ghost peaks), retention shifts, baseline (drift, noise, cycling, spikes), poor resolution, low/high response, carryover, reproducibility, integration, mobile-phase / column / sample-prep problems.
2. INSTRUMENT MALFUNCTIONS — pump (pressure ripple, leaks, prime/check valve, seal wash), autosampler (needle, rotor seal, sample loss), column oven (temperature instability), detector (UV/DAD lamp, flow cell, MS source), degasser, communication / error codes, leaks, and routine maintenance.

TOOLS:
- \`searchKnowledgeBase\`: search the lab's uploaded reference PDFs (vendor troubleshooting handbooks, service notes, application bulletins). CALL THIS FIRST for any symptom, error code, or maintenance question. Cite hits inline as (Doc Title) — do NOT invent page numbers; page metadata is not tracked.
- \`searchWeb\`: search the public web for manufacturer service notes, error codes, technical bulletins, recent forum posts, or part availability. Use freely whenever an instrument-specific error code, part number, recent advisory, or unfamiliar symptom comes up.
- \`scrapePage\`: read a specific URL in detail after a search.
- When you use information from the web, cite the source URL inline.

WHEN A CHROMATOGRAM IMAGE IS ATTACHED:
- Describe what you see first: number of peaks, approximate retention times if axes are visible, peak shape qualities, baseline behavior, any visible annotations or error overlays.
- Then map the observation to likely root causes, ranked most→least likely, with the diagnostic test or fix for each.
- Call out when the image quality / missing axis labels limit your confidence.

RULES:
- Ask 1–2 focused clarifying questions if essential context is missing (instrument model/vendor, column, mobile phase + pH, flow rate, detector, when it started, what changed).
- Give a short ranked differential ("Most likely → Possible → Less likely") with a one-line fix or check for each.
- Be specific: name parts (e.g. "outlet check valve", "PEEK frit", "rotor seal"), reagents, and safe procedures. Prefer manufacturer-agnostic guidance but adapt if the user names their instrument.
- Flag any safety concern (solvent compatibility, pressure, high-voltage, MS source) explicitly.
- Use concise markdown with short sections and bullet lists. No filler.`;

        const result = streamText({
          model,
          system,
          tools: troubleshootingTools,
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
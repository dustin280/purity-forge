/**
 * Shared AI SDK tools for the Column Advisor and HPLC Troubleshooting agents.
 * Lives server-side; tools are wired into streamText() per route.
 */
import { tool } from "ai";
import { z } from "zod";
import { firecrawlScrape, firecrawlSearch } from "@/lib/firecrawl.server";
import { lookupPartNumber } from "@/lib/inventory/part-lookup";

export const searchWebTool = tool({
  description:
    "Search the public web for HPLC column specs, vendor product pages, instrument service notes, manufacturer bulletins, error-code explanations, or recent forum posts. Returns up to 5 results with markdown excerpts. Use whenever you need information not in the saved catalog or when the user provides an unknown part number.",
  inputSchema: z.object({
    query: z.string().min(2).describe("Search query, e.g. 'Phenomenex Kinetex F5 part 00B-4723-AN spec sheet'"),
    limit: z.number().int().min(1).max(8).optional(),
  }),
  execute: async ({ query, limit }) => {
    try {
      const hits = await firecrawlSearch(query, limit ?? 5);
      return { ok: true as const, hits };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = /abort|timeout/i.test(msg)
        ? "Web search timed out — try a more specific query."
        : /402/.test(msg)
        ? "Web search credits exhausted."
        : /429/.test(msg)
        ? "Web search rate-limited — wait a moment and retry."
        : `Web search failed: ${msg}`;
      return { ok: false as const, error: friendly };
    }
  },
});

export const scrapePageTool = tool({
  description:
    "Fetch the full content of a specific URL as markdown plus an AI summary. Use after searchWeb to read a vendor's product page, technical bulletin, or service note in detail.",
  inputSchema: z.object({
    url: z.string().url(),
  }),
  execute: async ({ url }) => {
    try {
      const page = await firecrawlScrape(url);
      return { ok: true as const, page };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = /abort|timeout/i.test(msg)
        ? `Couldn't reach ${url} (timed out). Try another source.`
        : `Couldn't reach ${url}: ${msg}`;
      return { ok: false as const, error: friendly };
    }
  },
});

export const lookupCatalogTool = tool({
  description:
    "Look up a part number in the locally saved HPLC column / Agilent parts catalog. Returns matched vendor, model, and description if found.",
  inputSchema: z.object({
    partNumber: z.string().min(2),
  }),
  execute: async ({ partNumber }) => {
    const r = lookupPartNumber(partNumber);
    if (r.source === "none") return { found: false as const };
    return { found: true as const, source: r.source, label: r.label, values: r.values };
  },
});

export const proposeCatalogAdditionTool = tool({
  description:
    "Propose adding a newly discovered HPLC column to the user's saved catalog. The user will be shown an approval card and can save it with one click. Use this whenever you recommend an off-catalog column that has a verified vendor part number and source URL.",
  inputSchema: z.object({
    name: z.string().min(2).describe("Column name / model, e.g. 'Kinetex 2.6 µm F5 100 Å, 100 x 2.1 mm'"),
    partNumber: z.string().min(2),
    vendor: z.string().min(2).describe("Vendor name, e.g. Phenomenex"),
    description: z.string().optional(),
    sourceUrl: z.string().url().optional(),
  }),
  execute: async (input) => {
    // Server-side just echoes — the actual DB write happens client-side when
    // the user clicks Approve on the rendered card.
    return { status: "awaiting_approval" as const, ...input };
  },
});

export const advisorTools = {
  searchWeb: searchWebTool,
  scrapePage: scrapePageTool,
  lookupCatalog: lookupCatalogTool,
  proposeCatalogAddition: proposeCatalogAdditionTool,
};

export const troubleshootingTools = {
  searchWeb: searchWebTool,
  scrapePage: scrapePageTool,
};
/**
 * Firecrawl gateway helpers (server-only). Routed through the Lovable
 * connector gateway so we never hit the provider API directly.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl";

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
  if (!fcKey) throw new Error("FIRECRAWL_API_KEY missing (link the Firecrawl connector)");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": fcKey,
    "Content-Type": "application/json",
  };
}

export type WebSearchHit = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

export async function firecrawlSearch(query: string, limit = 5): Promise<WebSearchHit[]> {
  const res = await fetch(`${GATEWAY}/v2/search`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      query,
      limit: Math.max(1, Math.min(10, limit)),
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl search ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data?: { web?: Array<{ url: string; title?: string; description?: string; markdown?: string }> } | Array<{ url: string; title?: string; description?: string; markdown?: string }>;
  };
  const raw = Array.isArray(json.data) ? json.data : json.data?.web ?? [];
  return raw.map(h => ({
    url: h.url,
    title: h.title,
    description: h.description,
    markdown: typeof h.markdown === "string" ? h.markdown.slice(0, 4000) : undefined,
  }));
}

export async function firecrawlScrape(url: string): Promise<{ url: string; markdown?: string; summary?: string; title?: string }> {
  const res = await fetch(`${GATEWAY}/v2/scrape`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({ url, formats: ["markdown", "summary"], onlyMainContent: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data?: { markdown?: string; summary?: string; metadata?: { title?: string; sourceURL?: string } };
    markdown?: string;
    summary?: string;
    metadata?: { title?: string; sourceURL?: string };
  };
  const d = json.data ?? json;
  return {
    url: d.metadata?.sourceURL ?? url,
    title: d.metadata?.title,
    markdown: typeof d.markdown === "string" ? d.markdown.slice(0, 6000) : undefined,
    summary: d.summary,
  };
}
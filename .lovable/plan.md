## Diagnosis

The red "Error: network error" comes from `useChat`'s `error` handler firing mid-stream. Most likely cause in this conversation: the agent triggered `scrapePage`/`searchWeb` on Agilent's site, and Firecrawl took long enough (or returned a 5xx/402) that the streaming `Response` was aborted by the edge runtime. Because the tool `execute` currently **throws** on non-OK responses, the AI SDK stream errors out, the client sees a dropped connection, and `useChat` reports a generic "network error".

Two contributing issues:
1. `firecrawlSearch` / `firecrawlScrape` throw on any non-OK status or fetch failure → kills the whole stream instead of letting the model recover.
2. `toUIMessageStreamResponse` has no `onError`, so the message returned to the client is opaque ("network error") rather than the actual cause (timeout, 402 credits, 429 rate limit, etc.).

## Changes

**`src/lib/firecrawl.server.ts`**
- Wrap both `fetch` calls with an `AbortController` timeout (25s search, 30s scrape) so a hung Firecrawl request can't run past the edge function's streaming budget.
- Catch `AbortError` / network errors and return a structured `{ error }` instead of throwing.
- Trim scrape markdown harder (3000 chars) to keep tool results small.

**`src/lib/ai-agent-tools.server.ts`**
- `searchWebTool` / `scrapePageTool` already wrap in try/catch — keep that, but also surface a friendlier `error` string ("Web search timed out — try a more specific query" / "Couldn't reach that page") so the model can continue the conversation instead of the stream dying.

**`src/routes/api/chat-column-advisor.ts` and `src/routes/api/chat-troubleshooting.ts`**
- Pass `onError` to `toUIMessageStreamResponse` that returns the underlying error message (rate limit, credits exhausted, timeout, etc.) so the UI shows something actionable instead of "network error".
- Add explicit 429 / 402 handling around the `streamText` model call (try/catch on stream start) to return a clear 4xx response with a readable body.

## Result

- A slow or failing Firecrawl call no longer kills the chat — the model gets `{ ok: false, error: "..." }` back, can apologize or try a different query, and the stream completes normally.
- When something genuinely does fail (credits gone, rate limit, real network error), the red banner shows the real reason instead of "network error", so you know whether to retry, narrow the query, or top up credits.
- No UI changes; existing Fresh Session / catalog toggle / propose-catalog flow are untouched.

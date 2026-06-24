## Goal

Make the Column Advisor and HPLC Troubleshooting agents fully unrestrained — they can recommend/diagnose anything, search the web for unknown part numbers and current info, clearly label catalog vs off-catalog results, and offer to save new findings back to your catalog. A toggle lets you prioritize the saved catalog when you want.

## Changes

### 1. Firecrawl connector
- Link the Firecrawl connector so `FIRECRAWL_API_KEY` is available server-side. (You'll be prompted once.)

### 2. New tools available to both agents
Add AI SDK tools (server-side, inside each chat route) using `tool()` with Zod input schemas and `stopWhen: stepCountIs(50)`:
- `searchWeb(query, limit?)` — Firecrawl `search` with markdown scraping; returns title/url/snippet/markdown.
- `scrapePage(url)` — Firecrawl `scrape` (markdown + summary) for a specific vendor/spec page.
- `lookupCatalog(partNumber)` — calls the existing `lookupPartNumber()` so the model can check the local catalog itself.
- `proposeCatalogAddition({ name, partNumber, vendor, description, sourceUrl })` — needsApproval=true. On approval, inserts into `hplc_columns` (Column Advisor) via the existing `createHplcColumn` server fn. For Troubleshooting, this tool is omitted (or scoped to a future "known issues" table — out of scope unless you want it).

### 3. Column Advisor changes (`src/routes/api/chat-column-advisor.ts` + page)
- Switch from a static `catalogForPrompt()` system prompt to a tool-driven flow: system prompt instructs the model to (a) try `lookupCatalog` first when a part number is given, (b) use `searchWeb`/`scrapePage` when unknown or when the user asks for off-catalog options, (c) clearly mark each recommendation as **[In Catalog]** or **[Off-Catalog · web]** with the source URL, and (d) when an off-catalog item looks legitimate, call `proposeCatalogAddition` so you can approve adding it.
- Add a "Prioritize saved catalog" toggle in the chat toolbar UI. When ON, the system prompt tells the model to rank catalog matches first and only fall back to web; when OFF, treat catalog and web equally. Persist as a local UI state passed in the request body.
- Render tool calls inline in the message stream (search queries, scraped URLs, proposed catalog additions with an Approve button).

### 4. Troubleshooting agent changes (`src/routes/api/chat-troubleshooting.ts` + page)
- Add the same `searchWeb` and `scrapePage` tools so it can look up error codes, service notes, manufacturer bulletins, and recent forum posts.
- Update system prompt: encourage searching the web when an instrument-specific error code, part number, or recent advisory comes up; cite sources inline.
- Same toolbar surfacing of tool calls/citations.

### 5. UI: catalog-add approval
- When the model emits a `proposeCatalogAddition` tool call, render a card in the chat with the proposed fields editable + **Add to catalog** / **Dismiss** buttons. Approve triggers `createHplcColumn`; the column then shows up everywhere `listHplcColumns` is used.

## Technical notes

- Tools live in the chat route files (server-only), wired via `streamText({ tools, stopWhen: stepCountIs(50) })`.
- Firecrawl called via the connector gateway (`https://connector-gateway.lovable.dev/firecrawl/...`) with `Authorization: Bearer $LOVABLE_API_KEY` and `X-Connection-Api-Key: $FIRECRAWL_API_KEY`. No direct provider SDK.
- Web results are summarized to the model as markdown (capped length) to keep token usage in check.
- 402/429 from Firecrawl or AI Gateway surfaces as a clear chat error, not a silent failure.
- No DB schema changes for Column Advisor (reuses `hplc_columns`). Troubleshooting gets no new table.

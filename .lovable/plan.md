## HPLC Columns Picker + AI Assistant

### 1. Data
- Save uploaded CSV as `src/data/hplc-columns.csv` (123 rows).
- New loader `src/lib/maintenance/columns.ts`:
  - Reuse `parseCsv` helper (extract to shared `src/lib/maintenance/csv.ts`, or duplicate locally for simplicity).
  - `ColumnRow` type with the full set of fields from the CSV (Row Type, Model/Name, Part Number, Description, Specs, Application, Price, Product Family, Separation Mode, Particle Size, ID, Length, Pore Size, Hardware, Guard Column, Unit, Source URL, Matching Guard Part #, Guard Name, Guard Link, Guard Holder Link, Guard Match Status, Guard Notes).
  - In-memory cache via `loadColumns()`.

### 2. Maintenance landing tile
- `src/routes/_authenticated/maintenance/index.tsx`: add an **HPLC Columns** tile (lucide `Columns3` icon) linking to `/maintenance/hplc-columns`.

### 3. HPLC Columns route
- New file `src/routes/_authenticated/maintenance/hplc-columns.tsx` modeled on `part-picker.tsx`:
  - Search box (matches Model/Name, Part Number, Description, Application, Specs).
  - Filters: Product Family, Separation Mode, Particle Size, Hardware (selects populated from data).
  - Table columns: Family · Model/Name · Part # · Description · Specs · Particle · ID · Length · Pore · Hardware · Guard · Price · Agilent · eBay.
  - **Agilent** column: button/link opens `Source URL` (or Guard Agilent Link in guard rows) in a new tab when present.
  - **eBay** column: button opens `https://www.ebay.com/sch/i.html?_nkw=` + `encodeURIComponent("Agilent " + partNumber)`. Disabled when Part Number is `MULTIPLE`/blank.
  - Family/index rows visually de-emphasized (muted row) so the user can tell SKU rows from family rows.

### 4. AI Column Selection Assistant
- New server route `src/routes/api/chat-column-advisor.ts` (TanStack server route, streaming):
  - Uses Lovable AI Gateway via `createLovableAiGatewayProvider` (new `src/lib/ai-gateway.server.ts`).
  - Model: `google/gemini-3-flash-preview`.
  - System prompt: expert in Agilent HPLC/UHPLC column selection. Receives the full parsed column catalog (CSV is small, ~120 rows) as context each request so it only recommends columns that actually exist in the catalog. Asks clarifying questions when needed (analytes, polarity, mass range, pH, mode, instrument pressure limit, sample matrix, throughput).
  - Returns up to ~3 ranked recommendations with Part Number + brief rationale; user can then click through to the table.
  - Streams via `toUIMessageStreamResponse` with `withLovableAiGatewayRunIdHeader`.
- On `/maintenance/hplc-columns`:
  - A collapsible "Ask the Column Advisor" panel above the table.
  - Uses `useChat` (`@ai-sdk/react`) + `DefaultChatTransport({ api: "/api/chat-column-advisor" })`.
  - Single-session, no persistence (matches the maintenance tool style); a "Clear" button resets messages.
  - Renders `message.parts` with markdown (`react-markdown` if already present; otherwise plain whitespace-pre-wrap text to avoid adding a dep — confirm before adding).
  - Textarea auto-focuses; submit disabled during `submitted`/`streaming`.

### 5. Wiring
- Register `attachSupabaseAuth` is not required (route is unauthenticated within `_authenticated` layout; the chat route under `/api/` is public — gate it with a simple check that the request originates from the app via same-origin only, no secrets exposed).
- No new tables, no migrations.
- `LOVABLE_API_KEY` already managed by Lovable Cloud; provision via `lovable_api_key--create` if missing.

### Out of scope
- No editing/uploading of the catalog from the UI (CSV remains static, swappable later).
- No saving of chat history.
- No changes to existing Part Picker.

Confirm and I'll build it.
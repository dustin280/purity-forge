## Standalone Column Selector — implementation plan

This plan assumes you've created a blank Lovable project named **Column Selector** and opened it. From that project, paste this same prompt (or say "build the column selector") and I'll execute the steps below.

### What gets built

A single-page public app: the HPLC column selector (Agilent / Waters / Phenomenex) with filters, vendor/eBay links, and the AI advisor chat panel. No login, no sidebar, no other modules.

### Data sync strategy

- **CSV catalogs** are fetched at runtime from Purity Forge's published URL (`https://purity-forge.lovable.app/...`). When you update the CSVs in Purity Forge and republish, the Column Selector picks up the new data automatically — no copy needed.
- **UI / parsing logic / AI advisor prompt** are bundled. When you change those in Purity Forge, ping me from the Column Selector project saying "pull latest column selector code" and I'll re-copy the changed files.

To make CSV fetching work, Purity Forge needs to serve the CSVs at a public URL. Two options — I'll do **(A)** by default unless you say otherwise:

- **(A)** Add a public route `src/routes/api/public/columns-data/$vendor.ts` to Purity Forge that returns the bundled CSV text for `agilent | waters | phenomenex`. Public-API routes under `/api/public/*` bypass auth.
- **(B)** Move the CSVs to a public storage bucket and link directly.

### Files I'll create in the Column Selector project

```text
src/lib/columns.ts                       # ported from Purity Forge, fetches CSVs by URL
src/lib/ai-gateway.server.ts             # Lovable AI Gateway provider helper
src/routes/__root.tsx                    # minimal shell (title, meta, Outlet)
src/routes/index.tsx                     # the column selector page + advisor panel
src/routes/api/chat-column-advisor.ts    # AI advisor streaming endpoint
src/components/ui/*                      # shadcn primitives the page uses
```

### Files I'll add to Purity Forge (one small edit)

```text
src/routes/api/public/columns-data/$vendor.ts   # returns CSV text for the named vendor
```

### Key technical changes from the Purity Forge version

- `loadVendorColumns()` becomes async and fetches from `https://purity-forge.lovable.app/api/public/columns-data/<vendor>` with a short in-memory cache (5 min TTL). Falls back to a bundled snapshot if the fetch fails so the app still works offline.
- Page moves from `_authenticated/maintenance/hplc-columns.tsx` to `/` (no auth wrapper, no `AppShell`).
- Advisor endpoint is identical in shape; uses Lovable Cloud + `LOVABLE_API_KEY` in the new project (Cloud will be enabled automatically when the AI route is added).
- SEO: title "HPLC Column Selector", description, OG tags on the index route.

### What you need to do first

1. Create a new blank Lovable project named **Column Selector** (Dashboard → New project → blank template).
2. Open it and message me: "build the column selector — pull from Purity Forge".

I'll then run the file copies, add the public CSV endpoint here in Purity Forge, and wire the AI advisor. After that, ongoing updates work like this:

- **CSV changes** in Purity Forge → republish Purity Forge → Column Selector sees them automatically.
- **Code/UI/prompt changes** in Purity Forge → ping me in Column Selector to re-sync.

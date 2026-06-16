## Plan: Add prices + eBay search button to Part Picker

### 1. Merge pricing data into parts table
- Save uploaded `Agilent Parts List 1.csv` as `src/data/agilent-parts-prices.csv` (228 rows: Agilent Part Number, Retail Price, Price Status).
- Update `src/lib/maintenance/parts.ts`:
  - Import the prices CSV via `?raw`, parse into a `Map<partNumber, { price, status }>`.
  - Extend `PartRow` with `price?: string` and `priceStatus?: string`.
  - In `loadParts()`, look up each row's part number in the price map and attach.
  - Normalize "No public list price found" to a friendly `—` for display (keep raw status separately).

### 2. Update Part Picker UI (`src/routes/_authenticated/maintenance/part-picker.tsx`)
- Add a **Price** column (right-aligned, monospace, shows `—` when unknown).
- Add an **eBay** column with a button per row:
  - Label: `eBay` with `ExternalLink` icon (shadcn `Button` size `sm`, variant `outline`).
  - On click: build `https://www.ebay.com/sch/i.html?_nkw=` + `encodeURIComponent("Agilent " + partNumber)` and `window.open(url, "_blank", "noopener,noreferrer")`.
  - Disable when the row has no part number.
- Column order: existing columns → Price → eBay → (existing Where to Buy stays).

### Out of scope
- No changes to filtering/search logic, sidebar, or other routes.
- No backend/migrations — pricing stays as a static CSV alongside the parts CSV, easy to swap later.

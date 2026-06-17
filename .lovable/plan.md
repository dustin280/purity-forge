# HPLC Columns: Multi-Vendor Catalog + AI Advisor

Restructure the HPLC Columns page so the AI Column Advisor sits at the top, and the catalog tables are nested beneath it under vendor buttons (tabs). Add Waters as the second vendor now; Phenomenex slot ready for next upload.

## 1. Data

- Save uploaded `waters.csv` → `src/data/waters-columns.csv` (same shape as `hplc-columns.csv`, identical headers including guard-match fields).
- Generalize the loader: rename concept from "hplc-columns" to vendor-aware modules.
  - Keep `src/lib/maintenance/columns.ts` exporting the shared `ColumnRow` type and parser.
  - Add `loadVendorColumns(vendor)` that picks the right CSV (Agilent → existing `hplc-columns.csv`, Waters → new `waters-columns.csv`).
  - Add a `VENDORS` registry: `[{ id: "agilent", label: "Agilent", csv: ..., searchPrefix: "Agilent" }, { id: "waters", label: "Waters", csv: ..., searchPrefix: "Waters" }, { id: "phenomenex", label: "Phenomenex", csv: null, comingSoon: true }]`. The `searchPrefix` is used for the eBay query.

## 2. UI: `src/routes/_authenticated/maintenance/hplc-columns.tsx`

New layout, top to bottom:

1. **Page header** — "HPLC Columns".
2. **AI Column Selection Advisor** (the existing `AdvisorPanel`) — moved to the top, full width, always visible. Update its system prompt context to include rows from **all loaded vendor catalogs** (tagged with vendor) so it can recommend across vendors.
3. **Vendor catalog section** below the advisor:
   - A row of vendor buttons (shadcn `Tabs` or styled `Button` group): **Agilent | Waters | Phenomenex (coming soon, disabled)**.
   - Selecting a vendor swaps the table beneath it. State held in `useState<'agilent' | 'waters'>('agilent')`.
   - The existing search bar, filter dropdowns (Family / Mode / Particle / Hardware), and table render per-vendor using the same components (table is generic on `ColumnRow[]`).
   - **Vendor link column** is renamed dynamically: "Agilent" when vendor=agilent, "Waters" when vendor=waters. Opens `sourceUrl` in new tab.
   - **eBay button** uses the vendor's `searchPrefix` + part number (e.g. `"Waters " + partNumber`).

## 3. AI Advisor server route

- `src/routes/api/chat-column-advisor.ts`: load **both** vendor catalogs, concatenate via `catalogForPrompt()`, and pass to the system prompt. Tag each row with `[Vendor: Agilent|Waters]` so the model can cite vendor when recommending.
- No other changes; still uses `google/gemini-3-flash-preview` via the Lovable AI Gateway.

## 4. Out of scope (this round)

- Phenomenex data (tab is shown disabled / "coming soon" until you upload).
- No schema/UI changes to Part Picker or other Maintenance items.
- No persistence of advisor chats.

## Technical notes

- `ColumnRow` schema works as-is for Waters (the headers match).
- Filter dropdown options are computed from the **currently selected vendor's rows** so they stay relevant.
- Family/index rows (Row Type = "Family") rendered muted, same as today.
- File touch list:
  - add `src/data/waters-columns.csv`
  - edit `src/lib/maintenance/columns.ts` (vendor registry + multi-CSV loader)
  - edit `src/routes/_authenticated/maintenance/hplc-columns.tsx` (advisor on top, vendor tabs, dynamic link column + eBay prefix)
  - edit `src/routes/api/chat-column-advisor.ts` (multi-vendor context)

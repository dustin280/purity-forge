## Inventory module

Add a new "Inventory" section to the LIMS for tracking lab assets with category-specific structures and lifecycle status flags.

### Navigation
- Add `Inventory` item to the main sidebar (`src/components/lims/sidebar-nav.tsx`) with a `Boxes` icon, routing to `/inventory`.
- Create routes:
  - `src/routes/_authenticated/inventory/index.tsx` — list page
  - `src/routes/_authenticated/inventory/new.tsx` — add-new form

### Data model (one migration)

Two new tables in `public`:

**`inventory_items`** — the main entry
- `id uuid pk`
- `category text not null` — one of: `instrument`, `column`, `accessory`, `other`
- `make text`, `model text`, `serial_number text`, `description text`
- `purchase_date date`, `installation_date date`
- `installer_initials text`
- `status text not null default 'in_use'` — one of: `in_use`, `working_not_in_use`, `discarded` (single value, exclusive — see UX note)
- `created_by uuid`, `created_at`, `updated_at`

**`inventory_components`** — sub-components for `instrument` and `other` categories
- `id uuid pk`
- `item_id uuid fk → inventory_items.id on delete cascade`
- Same fields: `make`, `model`, `serial_number`, `description`, `purchase_date`, `installation_date`, `installer_initials`, `status`
- `position int` for ordering
- `created_at`, `updated_at`

Both tables: GRANT to `authenticated` + `service_role`, enable RLS, policies — authenticated users can SELECT all; INSERT/UPDATE/DELETE allowed for `tech`, `reviewer`, `admin` via `has_role()`. Updated-at trigger using existing `set_updated_at()`. Audit trigger via existing `audit_trigger()`.

### UX note on the three flags
The user described three checkboxes (in use / not in use but working / discarded) per entry and per component. These are mutually exclusive lifecycle states, so I'll render them as a 3-option control (radio group styled as checkbox tiles) backed by a single `status` column. This avoids invalid combinations like "in use AND discarded". If you actually want independent toggles, say so and I'll switch to three boolean columns.

### Server functions
`src/lib/inventory.functions.ts`:
- `listInventory()` — returns items + nested components
- `createInventoryItem({ item, components })` — creates item; if category is `instrument` or `other`, inserts components in a single call
- (List/create only for this first pass — edit/delete can come later)

### Add-new form (`/inventory/new`)
- Category selector first (Instrument / Column / Accessory / Other)
- Common fields: make, model, serial number, description, purchase date, installation date, installer initials, status (3-way)
- If category ∈ {instrument, other}: a "Components" section with add/remove rows, each collecting the same 8 fields including its own status
- Validate with Zod, submit via the server function, toast + navigate back to `/inventory`

### List page (`/inventory`)
- Simple table grouped or filterable by category, with status badge and component count. Click-through to detail can be added in a follow-up.

### Out of scope for this pass
Edit, delete, attachments, file uploads, PDF export, detail view — can be added in follow-ups once the data model is in place.

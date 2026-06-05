## Goal

Introduce a managed **Clients** directory backed by a new table, link it into the Chain of Custody (CoC) form for autopopulation, and add a "New Client" checkbox so a CoC submission can register a new client on the fly.

## 1. New tables

### `clients`
Primary client record. Fields:
- `company_name` (text, unique, required) — main search key
- `address` (text)
- `primary_contact_name` (text)
- `primary_contact_title` (text) — **new**
- `primary_contact_email` (text)
- `primary_contact_phone` (text)
- `is_active` (boolean, default true)
- standard `id`, `created_at`, `updated_at`, `created_by`

### `client_contacts`
Additional contacts (up to 10 enforced via a trigger or UI cap). Fields:
- `client_id` (uuid, FK → clients, on delete cascade)
- `name` (text, required)
- `title` (text)
- `email` (text)
- `phone` (text)
- `sort_order` (int)
- standard `id`, `created_at`, `updated_at`

### RLS (mirrors `hplc_columns`)
- Select: any authenticated user
- Insert/Update: tech, reviewer, admin
- Delete: admin only

## 2. Server functions — `src/lib/clients.functions.ts`

- `listClients({ search? })` — active clients ordered by company, optional ILIKE filter on company/contact
- `getClient({ id })` — client + contacts
- `createClient({ ...client, contacts: [] })` — used by both the Clients page and the CoC "new client" flow
- `updateClient({ id, ...patch, contacts? })` — replace contacts list on save
- `deactivateClient({ id })`

## 3. Clients page — `/_authenticated/clients`

- New sidebar entry "Clients"
- Top bar: search input (debounced, filters by company / contact / email) + **Add Client** button
- Card grid of clients; each card shows company, address, primary contact, count of extra contacts, and an **Edit** button
- **Add Client** and **Edit** open the same dialog: a form with the primary client fields plus a dynamic list of up to 10 additional contacts (Add Contact / Remove buttons; each row has name, title, email, phone)
- Form uses zod validation (required company, email format, phone length caps, max 10 contacts)

## 4. CoC form integration

- Add a new CoC field **`client_address`** (text, sort_order between contact phone and packaging condition) via migration seed
- In the CoC form's client info area, replace the free-text "Client Company Name" input with a **Client picker**:
  - Combobox listing active clients (search by company)
  - On select, autopopulate `client_company`, `client_contact_name`, `client_contact_email`, `client_contact_phone`, and the new `client_address`
- Add a **"New client — add to directory"** checkbox below the picker
  - When checked, the picker is hidden and the four contact fields + address become directly editable
  - On successful CoC submit, client-side calls `createClient` with those fields (primary contact only, no extras) and shows a toast "Client added to directory"

## 5. Out of scope (phase 1)

- Per-client document storage
- Bulk import / CSV upload
- Linking historical CoC records back to client rows retroactively
- Soft-delete restore UI (admin can re-activate via DB)

## Technical notes

- Reuse the existing `Combobox` pattern (see `coc-multiselect-field.tsx` / hplc column select) for the client picker.
- Contact rows in the edit dialog managed with local state array; submit replaces all contacts in a single server call (delete + insert in a transaction inside the server fn).
- Hard cap of 10 enforced both in the form (disable "Add Contact" at 10) and in the server function (reject >10).
- The CoC `client_address` field is stored in the existing `chain_of_custody_records.data` jsonb — no schema change to that table.

## Open question

When a user picks an existing client in the CoC form and then edits one of the autopopulated fields (e.g. corrects a phone number), should we:
1. Just save the edited value on the CoC record only (default), or
2. Prompt "Update this client's directory entry too?"

Plan currently assumes option 1.

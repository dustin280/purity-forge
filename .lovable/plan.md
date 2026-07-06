## Pending Orders Staging + Partner Webhook

Add a "Pending Orders" queue that receives orders from the partner site via signed webhook, holds them until physical samples arrive, then hands them off to the existing CoC / Sample Receipt flow — preserving the original payload for audit.

### 1. Database

New table `public.pending_orders`:
- `id uuid pk`
- `external_order_id text` (unique — dedupes webhook retries)
- `status text` — `pending` | `received` | `cancelled` (default `pending`)
- `order_date timestamptz`, `received_at timestamptz`, `cancelled_at timestamptz`
- `customer_name`, `customer_email`, `customer_company`, `customer_external_id` (text)
- `tracking_number`, `carrier`, `expected_arrival date`
- `total_samples int`, `special_instructions text`
- `raw_payload jsonb` — untouched original webhook body (kept forever)
- `linked_coc_id uuid → chain_of_custody_records(id) on delete set null`
- `received_by uuid`, `created_at`, `updated_at`

New table `public.pending_order_samples` (one row per `samples[]` entry):
- `id uuid pk`, `pending_order_id uuid fk cascade`
- `line_index int`, `external_sample_id text`
- `product_name text`, `quantity int`, `lot_batch text`, `notes text`

Standard grants + RLS: `authenticated` SELECT/UPDATE via `tech|reviewer|admin`; `service_role` ALL (used by the webhook route via `supabaseAdmin`); no anon.

Webhook signature secret stored via `add_secret` as `PARTNER_WEBHOOK_SECRET` (asked for after plan approval).

### 2. Webhook endpoint

`src/routes/api/public/orders/intake.ts` — `POST` handler:
- Reads raw body (`await request.text()`), verifies `x-signature` = `hex(hmacSHA256(body, PARTNER_WEBHOOK_SECRET))` with `timingSafeEqual`. Rejects with 401 on mismatch.
- Zod-validates payload matching partner JSON schema.
- Uses `supabaseAdmin` (imported inside handler) to upsert on `external_order_id` (idempotent retries return 200 with existing id) and insert child sample rows.
- Returns `{ ok: true, pendingOrderId }` (no PII).
- 400 on validation error, 500 on server error — details logged, not returned.

### 3. UI — Pending Orders queue

New route `src/routes/_authenticated/pending-orders/index.tsx`:
- Card list grouped by order, columns: External Order ID, Client (company), Order Date, Tracking, Sample count, Expected arrival, Status.
- Row actions: **Receive** (primary), **View payload** (JSON dialog), **Cancel** (admin/reviewer, sets `cancelled`).
- Filter tabs: Pending / Received / Cancelled. Default = Pending.

Sidebar nav entry "Pending Orders" with badge showing pending count.

Server fns in `src/lib/pending-orders.functions.ts`:
- `listPendingOrders({ status })`
- `getPendingOrder({ id })` — returns order + samples + raw_payload
- `cancelPendingOrder({ id })`
- `markPendingOrderReceived({ id, cocId })` — called from CoC save flow

### 4. Promotion to Sample Receipt

**Receive** button opens the existing `CocFormDialog` in a new "from pending order" mode:
- Prefills `data` fields from the pending order:
  - `sample_id` ← `externalOrderId`
  - `client_company` ← `customer.company`
  - `client_contact_name` ← `customer.name`, `client_contact_email` ← `customer.email`
  - `shipping_method` ← `carrier`, `tracking_number` ← `trackingNumber`
  - `shipment_date` ← `orderDate` (date portion)
  - `receipt_datetime` ← now
  - `comments` ← `specialInstructions`
- Prefills `line_items[]` one per pending sample:
  - `compound` ← `productName`, `lot` ← `lotBatch`, `vial_count` ← `quantity`, `physical_description` ← `notes`
- User edits/completes required fields (receiving lab, receiver, packaging, etc.) and submits normally.
- `submitCocWithSamples` gains an optional `pending_order_id` param. When present, after CoC + samples insert it sets `pending_orders.status='received'`, `received_at=now()`, `received_by=userId`, `linked_coc_id=coc.id`. The raw payload is retained.

Pending order rows are never deleted or mutated by the promotion — only the status/link fields change.

### 5. Partner integration package

Deliverable created as `docs/partner-webhook.md` in the repo, containing:
- Endpoint URL (`https://project--d45e2e9d-d5e3-4ac1-b61d-8c2b2a16f546.lovable.app/api/public/orders/intake` for prod, preview URL for staging).
- HTTP method, required headers (`Content-Type: application/json`, `x-signature: <hex hmac-sha256 of raw body>`).
- Full request JSON schema matching the payload you provided, with field constraints and required/optional flags.
- Signing example in Node + Python.
- Idempotency behavior (retry same `externalOrderId` = 200, no duplicate).
- Response codes (200, 400, 401, 500) and example bodies.
- Test procedure using `curl`.

### Technical notes

- Route uses `/api/public/*` so it bypasses auth on the published site; security = HMAC signature only.
- `supabaseAdmin` imported inside the handler (`await import(...)`) per server-runtime rules.
- No changes to existing `samples` / `chain_of_custody_records` schemas beyond adding the promotion link.
- `pending_orders` table keeps `raw_payload` indefinitely for audit.

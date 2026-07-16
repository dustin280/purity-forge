# Syxlab Partner Order Webhook

This document describes the HTTP webhook used to forward customer lab-testing
orders from a partner site into Syxlab. Each accepted order is staged in the
**Pending Orders** queue until the physical samples arrive at the lab. When
the shipment is received, lab staff opens the order in Sample Receipt and
finalizes intake into the normal sample-handling workflow. The full raw
payload is retained for audit.

## Endpoint

| Environment | URL |
|-------------|-----|
| Production  | `https://syxlab.org/api/public/orders/intake` |
| Staging     | `https://project--d45e2e9d-d5e3-4ac1-b61d-8c2b2a16f546-dev.lovable.app/api/public/orders/intake` |

> **Note:** `syxlab.org` is the canonical production host.
> `purity-forge.lovable.app` redirects there (HTTP 307), but partners should
> POST directly to `syxlab.org` — signed requests should never rely on a
> redirect hop.

- Method: `POST`
- Content-Type: `application/json`
- Charset: UTF-8

## Authentication

Requests are authenticated with an HMAC-SHA256 signature of the raw request
body, using a shared secret held by both sides. Syxlab will provide the
secret out of band; store it securely on your side and never commit it to
source control.

Required header:

```
x-signature: <hex_lowercase>
```

Where `<hex_lowercase>` is `HMAC_SHA256(shared_secret, raw_request_body)`
hex-encoded. Sign the **exact bytes you send** — do not re-serialize the JSON
after signing, as any whitespace difference will invalidate the signature.

## Idempotency

`externalOrderId` is the deduplication key. Sending the same
`externalOrderId` again returns HTTP 200 with the existing pending order id
and `duplicate: true`; no new record is created. This makes it safe to retry
on network failure or timeout.

## Request schema

```jsonc
{
  "externalOrderId": "ORD-20250706-001",   // required, string, ≤128 chars, unique
  "customer": {                             // optional
    "id": "CUST-789",                       // partner's customer id
    "name": "John Doe",
    "email": "john@example.com",
    "company": "Research Lab LLC"
  },
  "orderDate": "2026-07-05T14:30:00Z",      // ISO 8601, optional
  "shipping": {                             // optional
    "trackingNumber": "9400111899223856789012",
    "carrier": "USPS",
    "expectedArrival": "2026-07-08"         // YYYY-MM-DD
  },
  "samples": [                              // required, 1..500 items
    {
      "sampleId": "SMP-001",                // partner's internal id, optional
      "productName": "BPC-157 5mg",         // required, ≤255 chars
      "quantity": 1,                        // integer ≥1, default 1
      "lotBatch": "HG2412825",              // optional
      "notes": "For purity + net peptide content"  // optional, ≤2000
    }
  ],
  "totalSamples": 3,                        // optional; if absent, samples.length is used
  "specialInstructions": "Handle with care - temperature sensitive",
  "metadata": {}                            // optional free-form object, stored verbatim
}
```

Field-level mapping into the Syxlab Sample Receipt form (informational —
performed automatically when staff clicks *Receive*):

| Incoming field           | Syxlab field                    |
|--------------------------|---------------------------------|
| `externalOrderId`        | Invoice #                       |
| `customer.company`       | Client Company Name             |
| `customer.name`          | Client Contact Person Name      |
| `customer.email`         | Client Contact Email            |
| `shipping.carrier`       | Shipping Method                 |
| `shipping.trackingNumber`| Tracking / Air Waybill Number   |
| `orderDate` (date part)  | Date of Shipment                |
| `specialInstructions`    | Comments / Notes                |
| `samples[].productName`  | Line item: Compound             |
| `samples[].lotBatch`     | Line item: Lot                  |
| `samples[].quantity`     | Line item: Vial count           |
| `samples[].notes`        | Line item: Physical description |

## Responses

| Status | Meaning                                                                 |
|--------|-------------------------------------------------------------------------|
| 200    | Accepted (new or duplicate). Body: `{ ok: true, pendingOrderId, duplicate }` |
| 400    | Malformed JSON, or payload failed schema validation. Body includes an `issues` array. |
| 401    | Missing or invalid `x-signature` header.                                |
| 500    | Server error. Do not retry immediately; contact Syxlab if it persists.  |

Successful body example:

```json
{ "ok": true, "pendingOrderId": "e3b0c442-1234-4a5b-8c0d-abcd12345678", "duplicate": false }
```

Validation-error body example:

```json
{
  "ok": false,
  "error": "validation_error",
  "issues": [
    { "path": ["samples", 0, "productName"], "message": "Required" }
  ]
}
```

## Signing examples

### Node.js

```js
import crypto from "node:crypto";

const SECRET = process.env.SYXLAB_WEBHOOK_SECRET;
const URL = "https://syxlab.org/api/public/orders/intake";

async function sendOrder(order) {
  const body = JSON.stringify(order);            // sign the EXACT bytes you send
  const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-signature": signature,
    },
    body,
  });
  return res.json();
}
```

### Python

```python
import hmac, hashlib, json, os, requests

SECRET = os.environ["SYXLAB_WEBHOOK_SECRET"].encode()
URL = "https://syxlab.org/api/public/orders/intake"

def send_order(order: dict):
    body = json.dumps(order, separators=(",", ":")).encode()  # sign the bytes you send
    signature = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    return requests.post(URL, data=body, headers={
        "Content-Type": "application/json",
        "x-signature": signature,
    }).json()
```

### curl (using a shell)

```bash
BODY='{"externalOrderId":"TEST-001","samples":[{"productName":"BPC-157 5mg","quantity":1}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SYXLAB_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST "https://syxlab.org/api/public/orders/intake" \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIG" \
  -d "$BODY"
```

## Recommended retry policy

- 200 → done.
- 400/401 → do not retry; fix the payload or signature and resend.
- 5xx or network error → retry with exponential backoff (e.g. 30s, 2m, 10m,
  30m, 2h). Because the endpoint is idempotent on `externalOrderId`, retries
  are safe.

## Support

Contact Syxlab lab operations if you need the shared secret, a staging
endpoint provisioned, or the payload schema extended.
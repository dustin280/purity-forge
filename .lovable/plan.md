# Connect Syxlab to your employer ChatGPT (Outlook email → lab records)

## The short answer

Your employer's ChatGPT account can't be "borrowed" by this app — its Outlook connector lives inside that ChatGPT workspace and there's no way for Syxlab to call it. But we can flip the direction, which gets you exactly what you want:

**Make Syxlab itself a connector that your ChatGPT can call.**

Then in ChatGPT you say: *"Read the new order emails from Acme in my inbox and create pending orders in Syxlab."* ChatGPT uses its own Outlook connector to read the mail, and uses Syxlab's connector to write the records. No mailbox credentials ever touch this app.

## What gets built

An MCP server published with the app (this is the standard way ChatGPT/Claude/Copilot connect to an external system). It exposes a small, deliberate set of tools:

**Read tools**
- `list_clients` — find/confirm a client by name
- `list_pending_orders` — see what's already staged
- `get_sample_status` — batch/sample stage + percent complete (same data the partner status API returns)
- `list_parameters` / `list_compounds` — so ChatGPT maps email text to real test parameters and analytes

**Write tools**
- `create_pending_order` — stage an order parsed from an email into the existing Pending Orders queue (client, project, contact, line items, requested tests, notes, source reference)
- `add_pending_order_note` — append context from a follow-up email

Deliberately **not** exposed: anything that finalizes sample receipt, edits results, approves CoAs, or touches admin/integration settings. Everything an email produces lands in Pending Orders as a draft that a human finalizes in Sample Receipt — same as the partner webhook path today. Nothing bypasses your review step.

## Security

The connector is protected with OAuth, not left open. When you add Syxlab in ChatGPT, you sign in with your normal Syxlab account and approve it once. Every tool call then runs **as you**, under the same row-level permissions the web app uses. Another person's ChatGPT can't see your lab's data without a Syxlab login.

## Technical notes

- `@lovable.dev/mcp-js` with the TanStack Vite plugin; tools in `src/lib/mcp/tools/*`, registry in `src/lib/mcp/index.ts`, mounted at `/mcp`. The plugin generates the HTTP + OAuth metadata routes.
- `bunfig.toml` gets `@lovable.dev/mcp-js` added to `minimumReleaseAgeExcludes` (Lovable-owned scope).
- Supabase OAuth 2.1 authorization server enabled + a consent route at `src/routes/[.]lovable.oauth.consent.tsx`, wired to the existing `/login` page with redirect-back preserved.
- Tools query Supabase with the caller's verified token, so existing RLS applies unchanged. No service-role key in MCP code.
- Reuses existing logic: `pending_orders` insert path from `src/lib/pending-orders.functions.ts`, status mapping from the `/api/public/status` route, clients/parameters/compounds from their existing function modules.
- No changes to the logo, theme, connectors, webhook secret, or any current route.

## After it ships

You add it in ChatGPT under connectors using the published `/mcp` URL, sign in once, and can immediately ask it to triage order emails into Syxlab.

## Possible follow-up (not in this plan)

If you later want Syxlab to poll a shared `orders@` mailbox on its own — no ChatGPT in the loop — that's a separate Outlook connector build. Worth doing only if the email volume justifies automation; the ChatGPT path covers ad-hoc parsing today.

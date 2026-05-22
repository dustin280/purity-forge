# Synthesyx Lab Manager

A LIMS (Laboratory Information Management System) for peptide and pharmaceutical
purity testing. Built as a full-stack TanStack Start app with a managed
Postgres backend.

## Tech stack

| Layer            | Tech                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Framework        | React 19 + TanStack Start v1 (SSR/SSG) on Cloudflare Workers          |
| Routing          | TanStack Router (file-based, type-safe)                              |
| Data fetching    | TanStack Query 5                                                     |
| Styling          | Tailwind CSS v4 (CSS-first config in `src/styles.css`) + shadcn/ui   |
| Forms            | react-hook-form + Zod                                                |
| Backend          | Lovable Cloud (managed Supabase) — Postgres, Auth, Storage, RLS       |
| Server logic     | `createServerFn` (RPC) + file-based server routes under `routes/api` |
| Build            | Vite 7 via `@lovable.dev/vite-tanstack-config`                       |
| Runtime          | Cloudflare Workers (with `nodejs_compat`)                            |
| Auth             | Supabase Auth (email + Google OAuth) with role-based RLS              |
| PDFs             | jsPDF (client-side COA / COC generation)                              |

## Project structure

```
src/
  routes/                       File-based router. Each file = URL.
    __root.tsx                  Root layout: providers, head, error/404 shells.
    _authenticated.tsx          Pathless layout that guards children behind auth.
    _authenticated/             Protected pages (admin, lab logs, samples, …).
    api/public/                 External HTTP endpoints (webhooks, exports).
    login.tsx                   Public sign-in page.
  components/
    ui/                         shadcn/ui primitives (do not hand-edit).
    lims/                       Cross-feature LIMS UI (sidebar, status pill, …).
    <domain>/                   Feature-scoped components (forms, tables, …).
  hooks/                        Reusable React hooks.
  lib/
    *.functions.ts              Server functions (RPC) — auth-gated by middleware.
    *.ts                        Pure utilities, PDF builders, client helpers.
  integrations/
    supabase/                   Auto-generated client + types. Do not edit.
    lovable/                    Lovable platform integration.
  styles.css                    Tailwind v4 entry + design tokens (oklch).
  router.tsx, start.ts,
  server.ts                     App bootstrap (router, middleware, SSR entry).
supabase/
  migrations/                   Versioned SQL migrations (read-only here).
  config.toml                   Project-level Supabase config (managed).
```

## Setup

Prerequisites: [Bun](https://bun.sh) ≥ 1.0.

```bash
bun install
cp .env.example .env   # then fill in values
bun run dev
```

The dev server boots on the port reported in the terminal. SSR runs locally
against the Cloudflare Workers runtime via Vite.

## Environment variables

See [`.env.example`](./.env.example). Browser-visible vars are prefixed
`VITE_`; server-only vars are read from `process.env` inside server functions
and middleware. Never import `src/integrations/supabase/client.server.ts` from
client code — it carries the service-role key.

## Key architectural decisions

### Server logic lives in `createServerFn`, not Edge Functions

All app-internal backend work (database reads/writes, business rules,
third-party calls) is implemented as TanStack `createServerFn` RPCs under
`src/lib/*.functions.ts`. They are:

- Type-safe end-to-end (validators + inferred handler types).
- Auth-gated by the `requireSupabaseAuth` middleware, which attaches an
  authenticated Supabase client and the user's `userId` to the handler context.
- Invoked from React via `useServerFn` + TanStack Query (`useQuery` /
  `useMutation`), never called directly from `onClick` handlers.

File-based **server routes** (`src/routes/api/public/*.ts`) are reserved for
endpoints external systems hit directly — webhooks, public exports, cron
targets. They must verify signatures and validate input themselves.

### Auth is bearer-attached automatically

`src/start.ts` registers `attachSupabaseAuth` as a global `functionMiddleware`,
so every RPC carries the current user's access token. The
`_authenticated.tsx` layout double-guards by checking `supabase.auth.getSession`
in `beforeLoad` and redirecting to `/login` when absent.

### Roles via a separate `user_roles` table

Roles are stored in `public.user_roles` (one row per user/role) and checked
server-side through a `SECURITY DEFINER` `has_role(user, role)` function used
inside RLS policies. Never trust client state for authorization.

### Audit trail

The `audit_log` table records INSERT/UPDATE/DELETE diffs for sensitive tables.
Admins can browse it at `/admin/audit-log`.

### TanStack Query patterns

- The `QueryClient` is created fresh per request inside `getRouter`
  (no SSR data leaking between requests).
- `defaultPreloadStaleTime: 0` so Query — not the router cache — owns
  freshness.
- Mutations invalidate by the narrowest query-key prefix that can be affected.

### Styling

Tailwind v4 with CSS-first configuration in `src/styles.css`. Design tokens
are defined as `oklch` CSS variables and consumed via semantic class names
(`bg-background`, `text-foreground`, `bg-primary`, …). Components never
reference raw colors.

## Scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `bun run dev`       | Start the dev server with HMR + SSR.        |
| `bun run build`     | Production build (Cloudflare Workers).      |
| `bun run lint`      | ESLint over the source tree.                |

## Deployment

Deployed via Lovable to Cloudflare Workers. Stable URLs:

- Production: `https://purity-forge.lovable.app` (custom: `https://syxlab.org`)
- Preview:    `https://id-preview--<project-id>.lovable.app`

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for code conventions, query-key
rules, and where new code belongs.
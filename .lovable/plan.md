
# Codebase Refactor Plan

A phased, low-risk refactor preserving every existing feature, route URL, and DB behavior. Each phase is a separate turn so you can review and approve before moving on.

## Restore point

Lovable has built-in version history — no manual snapshot needed. Before Phase 1 lands, **this message itself is the restore point**: click the revert button on the AI message *immediately above* the first refactor commit to roll back the entire refactor.

```xml
<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
```

## Hard constraints (will NOT change)

- `vite.config.ts` stays minimal — `@lovable.dev/vite-tanstack-config` already bundles plugins; manual additions break the build.
- No `tailwind.config.ts` — Tailwind v4 is CSS-first via `src/styles.css`.
- No top-level `app/` or `api/` folders — TanStack Start here uses `src/routes/` and `src/routes/api/`.
- Locked files untouched: `src/routeTree.gen.ts`, `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher,types}.ts`, `.env`, `supabase/config.toml`.
- No route file renames — paths are URLs.
- No DB migrations, no server-function signature changes, no auth changes.

## Phase 1 — Docs & boundaries (safe, zero behavior change)

1. **README.md rewrite** — tech stack, project structure (post-refactor), local setup, env vars, auth model (RLS + roles), deployment notes, key architectural decisions (server fns vs server routes, query patterns, audit log).
2. **CONTRIBUTING.md** (new) — conventions: where new code goes, naming, query-key rules, RLS reminders.
3. **`.env.example`** (new) — mirror `.env` keys without values.
4. **File header comments** on every `src/lib/*.functions.ts`, `src/lib/*.ts`, `src/hooks/*.tsx`, `src/components/lims/*`, and route files — one-paragraph purpose.
5. **JSDoc** on every exported server function, hook, util, and non-trivial component prop type.
6. **Error + pending boundaries**: audit every route under `src/routes/_authenticated/**` and add `errorComponent` + `pendingComponent` where missing. Root already has `notFoundComponent` and `errorComponent` — leave intact.
7. **Tighten `tsconfig.json`** conservatively: enable `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`. If too noisy, downgrade to warnings only and leave a note.

## Phase 2 — `src/lib/` cleanup (low risk)

1. **`src/lib/query-keys.ts`** (new) — single source of truth for every TanStack Query key (`qk.samples.list()`, `qk.samples.detail(id)`, `qk.standardPreps.batch(groupId)`, `qk.auditLog.list(filters)`, etc.).
2. **`queryOptions` factories** — co-locate one per domain (e.g. `src/lib/standard-preparations.queries.ts`) wrapping the existing `*.functions.ts` server fns with `queryOptions({ queryKey, queryFn })`. Routes/components import these instead of inlining `useQuery({ queryKey: [...], queryFn: () => serverFn() })`.
3. **Dedupe** — extract repeated patterns (date-range filter shape, audit-diff formatting, status-pill mapping) into `src/lib/` utilities.
4. **Type re-exports** — `src/lib/types.ts` re-exports commonly-used DB row types from `integrations/supabase/types.ts` with friendly names (`type Sample = Tables<'samples'>`).
5. Update all call sites in route files to use the new factories. No URL or behavior change.

## Phase 3 — Component extraction (medium risk, highest visual improvement)

Target the largest route files. For each, split presentational pieces into `src/components/<domain>/`:

- `src/routes/_authenticated/admin/audit-log.tsx` → `AuditFilters`, `AuditTable`, `AuditDiffDialog`.
- `src/routes/_authenticated/lab-logs/standard-preparations/$id.tsx` → `PrepHeader`, `PrepTimeline`, `PrepActions`.
- `src/routes/_authenticated/lab-logs/standard-preparations/batch.$groupId.tsx` → `BatchSummary`, `BatchPrepList`.
- `src/routes/_authenticated/material-receipts/$id.tsx` → `ReceiptHeader`, `ReceiptDetails`.
- `src/routes/_authenticated/samples/$batchId.tsx` → `BatchHeader`, `SampleTable`.
- `src/routes/_authenticated/admin/index.tsx` → keep tile config, extract `AdminTile`.

Route files become thin: loader + composition. No props leak DB types directly; each component declares its own prop interface.

## Phase 4 — `features/` reorganization (highest blast radius — only after Phases 1–3 are green)

Introduce per-domain folders that co-locate components + queries + types. Route files (URL-bound) stay in `src/routes/` and import from features.

```text
src/
  features/
    standard-preparations/
      components/   (moved from src/components/standard-preparations/)
      queries.ts    (was src/lib/standard-preparations.queries.ts)
      server.ts     (re-export of standard-preparations.functions.ts)
      types.ts
      utils.ts
    material-receipts/
    samples/
    audit-log/
    admin/
    lab-logs/
  routes/           (unchanged URLs, thin route files)
  components/
    ui/             (shadcn — untouched)
    lims/           (cross-feature shared components stay here)
  hooks/
  lib/              (truly app-wide: utils, query-keys, error helpers)
  integrations/     (locked)
```

`*.functions.ts` files **stay in place** (or are re-exported) because moving them risks breaking the `requireSupabaseAuth` middleware wiring and the `attachSupabaseAuth` contract. Safest move: leave server fns where they are and create thin `features/*/server.ts` re-exports.

After this phase, if anything is broken and not quickly fixable, you revert Phase 4 only via the chat history button on the Phase 3 completion message — Phases 1–3 remain intact.

## Technical details

- **Query-key shape**: `['domain', 'list', filters?] | ['domain', 'detail', id] | ['domain', 'sub-resource', parentId]` — invalidation uses the prefix.
- **`queryOptions` pattern**: routes call `context.queryClient.ensureQueryData(qo)` in `loader`; components call `useSuspenseQuery(qo)`. Matches the project's existing `defaultPreloadStaleTime: 0` setup.
- **Error boundaries**: each route's `errorComponent` calls `router.invalidate()` + `reset()` and uses `useQueryErrorResetBoundary` so failed queries retry on user action.
- **JSDoc style**: `@param`, `@returns`, `@throws` where the server fn can throw; `@remarks` for RLS notes (e.g. "admins only — see `has_role`").
- **No barrel files** (`index.ts` re-exports inside features) — they hurt tree-shaking and Vite cold-start.
- **Imports** stay on the existing `@/` alias; no new aliases.

## Out of scope

- DB schema changes, RLS changes, auth changes.
- Adding tests (separate request — happy to plan after).
- Performance work beyond what falls out naturally from cleaner queries.
- Visual/design changes — purely structural.

## Deliverable per phase

After each phase I'll list what changed and pause for your approval before starting the next phase. If a phase introduces a regression you can't reproduce in dev, revert via chat history and we re-scope.

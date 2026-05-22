## Phase 2 — `src/lib/` cleanup

Low-risk refactor of data-access patterns. No URL, DB, auth, or behavior changes. All existing server functions stay in place with identical signatures.

### 1. New files

- **`src/lib/query-keys.ts`** — single `qk` object, source of truth for every TanStack Query key:
  - `qk.samples.list(filters?)`, `qk.samples.detail(id)`, `qk.samples.batch(batchId)`
  - `qk.standardPreps.list()`, `qk.standardPreps.detail(id)`, `qk.standardPreps.batch(groupId)`
  - `qk.materialReceipts.list()`, `qk.materialReceipts.detail(id)`
  - `qk.backpressure.list()`
  - `qk.auditLog.list(filters)`, `qk.accessLogs.list(filters)`
  - `qk.issues.list()`, `qk.users.list()`, `qk.cocFields.list()`, `qk.parameters.list()`
  - Hierarchical shape so `invalidateQueries({ queryKey: qk.samples.all })` invalidates the whole domain.

- **`src/lib/types.ts`** — friendly re-exports from `integrations/supabase/types.ts`:
  - `Sample`, `StandardPrep`, `MaterialReceipt`, `BackpressureLog`, `AuditLogRow`, `IssueReport`, etc. via `Tables<'...'>`.

- **Per-domain `*.queries.ts` factories** co-located in `src/lib/`:
  - `standard-preparations.queries.ts`
  - `material-receipts.queries.ts`
  - `samples.queries.ts`
  - `daily-backpressure.queries.ts`
  - `audit-log.queries.ts`
  - `issue-reports.queries.ts`
  - Each exports `queryOptions({ queryKey, queryFn })` factories wrapping the existing `*.functions.ts` server fns. Example: `standardPrepDetailQuery(id)`, `standardPrepBatchQuery(groupId)`.

### 2. Dedupe helpers

Extract repeated patterns currently inlined in route files into `src/lib/`:
- Date-range filter normalization (`src/lib/filters.ts`)
- Audit diff formatter (`src/lib/audit-diff.ts`) — pulled from `audit-log.tsx`
- Any duplicated status/label mappers → consolidate into `lims-utils.ts`

### 3. Call-site updates

Update every route/component that currently inlines `useQuery({ queryKey: [...], queryFn: () => serverFn() })` to use the new factories:
- `loader: ({ context }) => context.queryClient.ensureQueryData(qo)`
- Components switch to `useSuspenseQuery(qo)` where data is required, or keep `useQuery(qo)` where the existing UX shows loading states.
- Mutation `onSuccess` invalidations switch from string-array keys to `qk.*` references.

Routes touched (read-only structural change, no behavior diff):
- `_authenticated/samples/index.tsx`, `samples/$batchId.tsx`, `samples/new.tsx`
- `_authenticated/lab-logs/standard-preparations/{index,$id,batch.$groupId,new}.tsx`
- `_authenticated/lab-logs/daily-backpressure/index.tsx`
- `_authenticated/material-receipts/{index,$id,new}.tsx`
- `_authenticated/admin/{audit-log,access-logs,coc-fields,parameters}.tsx`
- `_authenticated/issues/index.tsx`
- `_authenticated/users.tsx`

### 4. Hard constraints (unchanged from plan)

- No edits to `*.functions.ts` signatures, RLS, DB, auth, locked files, or `vite.config.ts`.
- No route renames, no new URLs.
- No barrel files.

### Deliverable

After Phase 2 lands, every Query key in the app is centralized, every query is reusable via a factory, and routes are noticeably shorter. I'll list the changed files and pause for approval before Phase 3 (component extraction).

### Restore point

Same as before — revert via chat history on this message to roll back Phase 2 only, keeping Phase 1 intact.

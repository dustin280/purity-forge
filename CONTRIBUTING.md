# Contributing

Conventions for working in this codebase. Read once before your first PR.

## Where new code goes

| You are adding…                              | Put it in…                                       |
| -------------------------------------------- | ------------------------------------------------ |
| A new page / URL                             | `src/routes/...` (file path = URL)               |
| A protected page                             | `src/routes/_authenticated/...`                  |
| A webhook / cron / public API                | `src/routes/api/public/...`                      |
| A reusable presentational component          | `src/components/<domain>/...`                    |
| A shadcn primitive                           | `src/components/ui/...` (use the CLI, don't hand-edit) |
| A pure utility                               | `src/lib/<name>.ts`                              |
| A server RPC (DB read/write, business logic) | `src/lib/<domain>.functions.ts`                  |
| A React hook                                 | `src/hooks/use-<name>.tsx`                       |

After Phase 4 of the refactor, domain code moves to `src/features/<domain>/`;
route files stay where they are.

## Naming

- Files: `kebab-case.ts(x)`.
- Components: `PascalCase`.
- Hooks: `useThing`.
- Server functions: `verbNoun` (`listSamples`, `createPrep`, `updateStatus`).
- Query keys: see below.

## Server functions

- Always wrap with `requireSupabaseAuth` middleware unless the endpoint is
  explicitly public.
- Validate every input with Zod via `.inputValidator(...)`.
- Read secrets via `process.env.X!` **inside `.handler()`**, never at module
  scope.
- Derive `userId` from `context.userId`, never from client input.
- Throw on errors; do not return `{ error: ... }` envelopes.

## Calling server functions from React

```ts
const fn = useServerFn(myServerFn);
const { data } = useQuery({
  queryKey: qk.domain.list(filters),
  queryFn: () => fn({ data: filters }),
});
```

Never call a server function directly from `onClick` — go through
`useMutation` so loading/error state and cache invalidation are wired.

## Query keys

Shape: `['<domain>', '<kind>', ...args]`.

- `['samples', 'list', filters?]`
- `['samples', 'detail', id]`
- `['standard-preps', 'batch', groupId]`

After Phase 2, every key is exported from a centralized `query-keys` module.
Invalidation always uses the broadest safe prefix.

## Auth & RLS

- Roles live in `public.user_roles`; checked via the `has_role(user, role)`
  `SECURITY DEFINER` function inside RLS policies.
- Never gate sensitive UI on client-side role state alone — the server
  enforces it; the UI just hides things the user can't use.
- Don't store roles on `profiles` or anywhere mutable by users.

## Database changes

- Always via the migration tool (creates a new timestamped file under
  `supabase/migrations/`). Do not edit existing migration files.
- Use validation triggers, not `CHECK` constraints, for time-based rules.
- Never modify reserved schemas (`auth`, `storage`, `realtime`,
  `supabase_functions`, `vault`).
- Never edit `src/integrations/supabase/types.ts` by hand.

## Styling

- Tailwind v4, CSS-first. All tokens live in `src/styles.css`.
- Use semantic classes (`bg-primary`, `text-muted-foreground`), never
  `bg-[#fff]` or raw colors in components.
- Add new tokens to `:root` in `src/styles.css` before consuming them.

## TypeScript

- `strict: true`. Do not add `as Type` casts to escape errors — fix the type.
- Never annotate values inferred by TanStack Router or TanStack Query — let
  inference work.
- Use `import type` for type-only imports.

## Locked files (never edit)

- `src/routeTree.gen.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/types.ts`
- `.env` (use `.env.example` to document keys)
- `supabase/config.toml` project-level settings
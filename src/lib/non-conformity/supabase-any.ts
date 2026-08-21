/**
 * The nc_* tables aren't in the generated Supabase types yet (see
 * types.ts sync note elsewhere in this codebase) — this alias keeps the
 * `any` cast to one disable comment per file instead of one per query,
 * matching the pattern already used for large untyped-table sections
 * (e.g. src/lib/run-lists/generate.functions.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabase = any;

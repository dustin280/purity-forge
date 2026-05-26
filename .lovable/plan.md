## Goal

Replace the `test_parameters` source for the Parameter Scouting Run List picker with a dedicated, user-manageable compound list, seeded with 26 peptides/compounds. Provide both admin management and inline "+ Add" from the picker.

## Database

New table `public.compounds`:
- `id uuid pk`, `name text not null unique`, `is_active boolean default true`, `created_by uuid`, `created_at`, `updated_at` (+ `set_updated_at` trigger).
- RLS:
  - select: any authenticated user
  - insert: tech / reviewer / admin (so inline-add from the picker works for techs)
  - update / delete: admin only
- Seed the 26 compounds:
  TB500 (Thymosin β4 fragment), Ipamorelin, BPC-157 Acetate, Semax, SS-31 (Elamipritide), Melanotan (MT-II), NAD (NAD+), Glutathione, Tesamorelin, Retatrutide, GHK-Cu, Tirzepatide, Semaglutide, Selank, Cagrilintide, Sermorelin, Tadalafil, Epitalon, Pinealon, CJC-1295, KPV, PT-141 (Bremelanotide), BPC-157 (free), MOTS-C, Thymosin Beta 4.

## Server functions (`src/lib/compounds.functions.ts`)

- `listCompounds()` — active compounds, ordered by name.
- `createCompound({ name })` — Zod-validated, trimmed, case-insensitive duplicate check.
- `updateCompound({ id, name?, is_active? })` — admin only (enforced server-side).
- `deleteCompound({ id })` — admin only.

## Parameter Scouting changes

- `use-parameter-scouting.ts`: swap `listParameters` → `listCompounds`; expose `createCompound` mutation.
- `compound-picker.tsx`: keep Command/Popover, add a footer row "+ Add '<typed text>'" that calls `createCompound`, then selects the new entry. Available to any user who can save a scouting entry.
- Stored `run_list[].parameter_id` is renamed conceptually to `compound_id` (jsonb stays free-form, but the new code writes `compound_id` + `name`; reads tolerate the legacy `parameter_id` for any pre-existing rows).

## Admin page

- New route `src/routes/_authenticated/admin/compounds.tsx` + components under `src/components/admin/compounds/` (add form + list with rename / deactivate / delete), modeled on `admin/parameters`.
- Add a "Compounds" tile to the Admin index.

## "Shared across modules"

Audit confirms the only true compound picker today is in Parameter Scouting. Standard Preparations uses `standard_suggestions` (standard names with typical solvent/concentration), which is a different concept and is left as-is. The new `compounds` table is the canonical compound list — any future picker should source from it.

## Out of scope

- No data migration of `test_parameters` (that table stays for HPLC test parameter definitions).
- No edits to Standard Preparations or other existing flows.
- No extra compound metadata (MW, CAS, default conc) — name only for now; easy to extend later.

## Files

Created:
- `supabase/migrations/<ts>_compounds.sql`
- `src/lib/compounds.functions.ts`
- `src/routes/_authenticated/admin/compounds.tsx`
- `src/components/admin/compounds/add-form.tsx`
- `src/components/admin/compounds/compounds-list.tsx`

Edited:
- `src/lib/query-keys.ts` (add `compounds` key)
- `src/components/parameter-scouting/use-parameter-scouting.ts` (swap source, add create mutation)
- `src/components/parameter-scouting/compound-picker.tsx` (inline add)
- `src/components/parameter-scouting/run-list-editor.tsx` (pass through create handler if needed)
- `src/routes/_authenticated/admin/index.tsx` (Compounds tile)
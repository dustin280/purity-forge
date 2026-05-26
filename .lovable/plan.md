# Responsive Polish Pass

Goal: comfortable mobile (≤640px) and tablet (641–1023px) experience while leaving desktop (≥1024px) layout unchanged. Pure presentational changes — no feature removal, no logic edits.

## Approach

Adopt `lg` (1024px) as the "desktop" breakpoint everywhere navigation/layout chrome is concerned, and audit page-level containers, tables, grids, dialogs, and toolbars to stack/scroll gracefully below it.

## Scope of changes

### 1. App shell & navigation
- `src/components/lims/sidebar-nav.tsx`
  - Move sidebar visibility from `hidden md:flex` → `hidden lg:flex` so tablets also get the hamburger sheet (more horizontal room for dense pages).
  - Switch `MobileTopBar` from `md:hidden` → `lg:hidden`.
  - Bump hamburger button hit area to min 44×44 (`h-11 w-11`).
- `src/routes/_authenticated.tsx`: no structural change; verify `min-w-0` + `overflow-x-auto` still good.

### 2. Page containers (consistent responsive padding)
Across the route files under `src/routes/_authenticated/**`, normalize the outer wrapper from `p-6 md:p-8` to `p-4 sm:p-6 lg:p-8` and ensure headings scale (`text-2xl sm:text-3xl`). Affected pages: dashboard, chain-of-custody, intake, samples, lab-logs, scheduler, lab-journal, issues, integrations, admin/*, users, material-receipts.

### 3. Grids → stack on small screens
Audit `grid grid-cols-N` usage in dashboard cards, admin tiles, sample detail panels, scheduler controls, lab-journal layout: ensure base is `grid-cols-1`, then `sm:grid-cols-2` / `lg:grid-cols-3` etc. No change where already responsive.

### 4. Tables → horizontal scroll wrappers
Wrap any wide `<Table>` (samples list, chain-of-custody, users, instruments admin, lab-logs, material-receipts) in `<div className="-mx-4 sm:mx-0 overflow-x-auto"><div className="min-w-[720px]">…</div></div>` so columns stay legible without breaking the desktop look.

### 5. Scheduler timeline
`src/components/scheduler/scheduler-page.tsx`: keep week/day/month grids exactly as-is on `lg+`; on smaller screens wrap timeline in horizontal scroll and stack the toolbar (view toggle + instrument filter + nav buttons) vertically with full-width controls.

### 6. Lab Journal split view
The journal page currently shows a list + editor side-by-side. Below `lg`, stack vertically (list above, editor below) using existing `lg:grid-cols-[…]` pattern; no behavior change.

### 7. Dialogs, forms, toolbars
- Dialog content: add `max-h-[90vh] overflow-y-auto` and `w-[95vw] sm:max-w-lg` patterns where missing (booking-dialog, entry-form, combined-export-dialog, instrument admin dialog).
- Form action rows: `flex flex-col-reverse sm:flex-row sm:justify-end gap-2` so primary CTA sits on top on mobile and buttons go full-width (`w-full sm:w-auto`).
- Filter/search toolbars (samples, lab-journal, lab-logs): `flex flex-col sm:flex-row gap-2` with `w-full sm:w-auto` inputs.

### 8. Touch targets & typography
- Ensure icon buttons in toolbars/table rows are at least `h-10 w-10` on mobile (Tailwind `size-10 lg:size-9`).
- Base body font already 14px; bump small `text-xs` action buttons to `text-sm` on mobile where they're primary actions.

## Out of scope
- No changes to server functions, data models, queries, or business logic.
- No redesign — colors, typography scale, and component variants stay identical.
- Desktop (≥1024px) rendering must be visually identical (only `md:` → `lg:` shell switch is intentional).

## Verification
- Spot-check at 375px, 768px, 1024px, 1440px on: dashboard, samples list+detail, scheduler (week view), lab journal, an admin page, a dialog.
- Confirm no horizontal page scroll on mobile (tables scroll inside their wrapper only).

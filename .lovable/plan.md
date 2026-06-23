## Problem

Printing vial labels emits a blank first page; the labels land on page 2 even though the on-screen "Sheet 1 of N" is correct.

Two root causes:

1. **Global `@page` conflict** — `src/styles.css` has a project-wide print block that forces `@page { size: landscape; margin: 0.4in }`. That rule merges with the vial-labels `@page { size: 8.5in 11in; margin: 0 }`, leaving the page size ambiguous and inflating margins so the 8.5×11 sheet overflows and pushes a blank page in front of it.
2. **`visibility: hidden` keeps layout space** — the vial-labels print CSS hides everything with `visibility: hidden` and re-shows `.vl-print-root`. Visibility-hidden elements still occupy their box, so the authenticated layout (sidebar, header, page padding) reserves a full page worth of vertical space before the sheet, producing a leading blank page. `.vl-preview-wrap` is `position: absolute` but its containing block is the authenticated layout, not the page, so it doesn't escape.

## Fix

Edit only `src/routes/_authenticated/vial-labels.tsx` and `src/styles.css`. No logic changes.

### `src/styles.css`

Scope the global landscape print rules so they don't leak into the vial-labels page:

- Change the `@media print` block to opt-in: gate `@page { size: landscape; margin: 0.4in }` and the `.print-area` table styles behind a wrapper class such as `.print-landscape` (or move them into the few route files that currently rely on them — access-logs, etc.).
- Leave the generic `print-hide` / body color rules intact.

If any existing pages depend on the implicit landscape behavior, add `print-landscape` to their top-level container in the same patch.

### `src/routes/_authenticated/vial-labels.tsx` (PRINT_CSS only)

Replace the `visibility: hidden` strategy with a `display: none` strategy and pin the print tree to the page origin:

- `@media print`:
  - `html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }`
  - `body > *:not(.vl-print-portal) { display: none !important; }` — and wrap the `.vl-preview-wrap` in a `<div className="vl-print-portal">` rendered via `createPortal(..., document.body)` so it is a direct child of `<body>`. This guarantees no ancestor padding/margins push it down.
  - Alternative if avoiding a portal: keep `.vl-preview-wrap` in place but set it `position: fixed; inset: 0; padding: 0; margin: 0;` under print, and switch every non-print element to `display: none !important` instead of `visibility: hidden`.
  - `.vl-print-root { display: block; gap: 0; }`
  - Keep `.vl-sheet { page-break-after: always }` and `.vl-sheet:last-child { page-break-after: auto }` to prevent a trailing blank page when sheet count is exactly 1.
  - Confirm the live-preview tree (`.vl-live`) is `display: none` — already true, keep it.

Prefer the portal approach: it is the most reliable way to escape the authenticated layout's positioned ancestors and matches how the lab-journal/CoA printable views avoid the same class of bug.

### Verification

- Print preview with 1 sheet → exactly 1 page, labels on page 1.
- Print preview with 3 sheets → exactly 3 pages, no leading or trailing blanks.
- Other routes that still need landscape printing (access-logs export view) keep working because they get the opt-in `print-landscape` class.

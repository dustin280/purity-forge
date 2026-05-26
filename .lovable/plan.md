## Lab Journal (personal, per-user)

Add a **Lab Journal** item to the sidebar for every authenticated user. Each entry is private to its author (only the author and admins can read/write/delete).

### Database
New table `public.lab_journal_entries`:
- `id`, `user_id` (auth user), `user_name` (snapshot)
- `entry_at` (timestamptz, default now — captured when form opens, editable)
- `title` (text, nullable, optional)
- `body` (text, large free-write)
- `created_at`, `updated_at` (+ trigger)

RLS:
- SELECT: `user_id = auth.uid()` OR admin
- INSERT: `user_id = auth.uid()`
- UPDATE/DELETE: `user_id = auth.uid()` OR admin

### Server functions (`src/lib/lab-journal.functions.ts`)
- `listJournalEntries()` — returns current user's entries, newest first
- `createJournalEntry({ entry_at, title?, body })`
- `updateJournalEntry({ id, entry_at?, title?, body? })`
- `deleteJournalEntry({ id })`

All Zod-validated; `body` up to ~50k chars, `title` up to 200.

### UI
- Sidebar: add **Lab Journal** (Notebook icon) under Operations, visible to everyone.
- Route `/_authenticated/lab-journal/index.tsx`:
  - Left/top: "New entry" button + searchable list of past entries (date · title · snippet).
  - Right/below: editor panel.
- `src/components/lab-journal/`:
  - `entry-form.tsx` — date+time input prefilled with `new Date()` on open, optional Title, large `Textarea` (autosize, ~20+ rows) for body, Save / Save & Export PDF / Delete.
  - `entries-list.tsx` — list with search box (title + body contains).
  - `use-lab-journal.ts` — TanStack Query hooks.
  - `journal-pdf.ts` — generate PDF via existing `pdf-lib`/`jspdf` pattern used in the project (matches `coc-pdf.ts` / `coa-pdf.ts` style): header with Synthesyx logo, user name, entry date/time, title, body (wrapped), page numbers.

### Suggested extras (included unless you say otherwise)
1. **Search** across title + body.
2. **Edit anytime** (entries are personal notes, not approved records — no review workflow).
3. **Markdown rendering** in a read view (write in plain text/markdown, render headings/lists/bold on view + PDF). Lightweight, no new heavy deps.
4. **Tags** (free-text chips) for grouping ideas across entries — filterable in the list.
5. **Attachments**: optional file/image uploads per entry, stored in a private `lab-journal` bucket scoped by `user_id/`. Useful for pasting chromatograms, photos of plates, etc.
6. **"Insert timestamp" button** inside the body so users can mark sub-steps while writing.
7. **Auto-save draft** to localStorage so an accidental nav doesn't lose work.
8. **Export all my entries** (date range → single combined PDF) for record-keeping.
9. **Privacy note** in the UI: "Only you and admins can read your journal."

### Out of scope
- Sharing entries between users / comments / mentions.
- Rich-text WYSIWYG editor (Markdown keeps it simple + PDF-friendly).
- Linking entries to specific samples/preparations (could add later as a `related_*` field).

### Files to create/edit
- Migration: `lab_journal_entries` + RLS + storage bucket `lab-journal` (if attachments approved).
- `src/lib/lab-journal.functions.ts`
- `src/routes/_authenticated/lab-journal/index.tsx`
- `src/components/lab-journal/entry-form.tsx`, `entries-list.tsx`, `use-lab-journal.ts`, `journal-pdf.ts`
- Edits: `src/components/lims/sidebar-nav.tsx` (add nav item), `src/lib/query-keys.ts`

### Quick questions before I build
1. Include all 9 suggested extras, or only a subset? (Especially: attachments, markdown, tags — each adds some surface area.)
2. Should **admins** be able to read other users' journals (for compliance), or strictly private even from admins?
3. PDF style: match the existing CoA/CoC branded header, or a simpler plain layout?

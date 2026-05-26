# Lab Journal — Tags, Markdown, Attachments, Combined PDF

Adds four enhancements to the existing personal Lab Journal. Search now also matches tags. Editing, PDF export, and RLS (per-user + admin) stay as today.

## 1. Tags + filtering
- DB: add `tags text[] not null default '{}'` to `lab_journal_entries`; GIN index for fast contains/search.
- Server fn schema: `tags: z.array(z.string().min(1).max(40)).max(20).optional()` on create/update.
- Entry form: tag input chip editor (comma/Enter to add, click × to remove), max 20 tags, 40 chars each.
- Entries list:
  - Render tag chips next to each row.
  - Search box matches title, body, **or** tag (case-insensitive).
  - Add a "Filter by tag" dropdown showing all distinct tags across the user's entries; clicking a tag chip in a row also filters.
- PDF: tags shown under "Date / Time" line.

## 2. Markdown rendering
- Add `react-markdown` + `remark-gfm` (GitHub-flavored: tables, task lists, strikethrough, autolinks).
- Entries list: snippet stays plain-text; add an expand/collapse caret on each row that reveals the full entry rendered as markdown (read-only).
- Entry form body stays a plain `<Textarea>` (write markdown source). Add a "Preview" toggle that swaps the textarea for the rendered output.
- PDF stays plain-text (current renderer); markdown source is preserved verbatim.

## 3. File attachments (per entry)
- New private storage bucket `lab-journal-attachments` (not public). Path convention: `{user_id}/{entry_id}/{uuid}-{filename}`.
- Storage RLS: only the owning user (path's first folder = `auth.uid()`) or an admin can SELECT / INSERT / DELETE.
- New table `lab_journal_attachments` (`id`, `entry_id`, `user_id`, `file_path`, `file_name`, `content_type`, `size_bytes`, `uploaded_by`, `uploaded_at`). RLS mirrors the parent entry (owner or admin).
- Server fns in `src/lib/lab-journal-attachments.functions.ts`:
  - `listAttachments(entry_id)`, `signAttachmentUrl(id)` (returns short-lived signed URL), `deleteAttachment(id)` (removes row + storage object).
- Upload happens client-side via `supabase.storage.from(...).upload(...)` after the entry exists, then a server fn inserts the row.
- Limits: 10 files per entry, 20 MB each, common types (images, PDF, CSV, TXT, XLSX, DOCX).
- Entry form: attachment panel (only visible when editing or after first save) with drag-and-drop + file picker, thumbnail for images, filename + size for others, download and delete buttons.
- New entries: show attachments panel as disabled with a hint "Save the entry first to attach files."

## 4. Combined PDF export
- New "Export combined PDF" button above the entries list with a date-range picker (from / to, both optional) and an optional tag filter.
- New helper `downloadCombinedJournalPdf(entries)` in `src/lib/journal-pdf.ts`:
  - Shared Synthesyx header on every page.
  - Cover page: title, author, range, tag filter, total entry count.
  - Each entry: H2 title + metadata + tags + body, separated by a page break.
  - Footer: `Page X of Y · Confidential — personal lab journal`.
- Filename: `lab-journal-combined-{from}_{to}.pdf` (or `-all` when unbounded).

## Files

**Migrations (1 new):**
- `supabase/migrations/<ts>_lab_journal_extras.sql` — adds `tags` column + GIN index to `lab_journal_entries`; creates `lab_journal_attachments` table with RLS; creates `lab-journal-attachments` storage bucket + storage.objects policies.

**New files:**
- `src/lib/lab-journal-attachments.functions.ts`
- `src/components/lab-journal/tag-input.tsx`
- `src/components/lab-journal/attachment-panel.tsx`
- `src/components/lab-journal/markdown-view.tsx`
- `src/components/lab-journal/combined-export-dialog.tsx`

**Edited files:**
- `src/lib/lab-journal.functions.ts` — add `tags` to create/update schemas and `LabJournalEntry`.
- `src/lib/journal-pdf.ts` — render tags; add `downloadCombinedJournalPdf`.
- `src/components/lab-journal/entry-form.tsx` — tag editor, markdown preview toggle, attachments panel (edit mode).
- `src/components/lab-journal/entries-list.tsx` — tag chips, tag filter, expand/collapse markdown view, combined-export button.
- `src/components/lab-journal/use-lab-journal.ts` — pass `tags` through.
- `src/lib/query-keys.ts` — add `labJournalAttachments` keys.

## Dependencies
- `bun add react-markdown remark-gfm`

## Out of scope
- Sharing entries between users.
- WYSIWYG editor (markdown source only).
- Server-side full-text search (client-side filtering is fast enough at the 500-entry cap).

## What I'm changing

Both AI assistants — **Column Advisor** (`/maintenance/hplc-columns`) and **Troubleshooting** (`/maintenance/troubleshooting`) — get the same toolbar treatment:

- **Copy** — copies the full assistant response (plain text) to the clipboard
- **PDF** — generates and downloads a clean PDF of the conversation (fixes the about:blank issue)
- **Print** — opens a printable view (fixes the about:blank issue)
- **History** — per-signed-in-user conversation history stored in Lovable Cloud

## Why PDF/Print currently fails

Today neither page has a working PDF or print control. The about:blank behavior is consistent with the previous implementation trying to `window.open()` a blob/URL that gets garbage-collected before the new tab loads, or a popup blocker swallowing it on subsequent attempts. The new implementation does it inline:
- **PDF**: build the PDF with `jsPDF` (already used elsewhere in this project — `coc-pdf.ts`, `material-receipt-pdf.ts`) and trigger `doc.save(filename)` directly — no `window.open`.
- **Print**: render the conversation into a hidden, print-only block on the same page and call `window.print()`. No new tab, no popup blocker, works every session.

## History — per-user, DB-backed

IP/device fingerprinting is unreliable (shared IPs, mobile carriers, VPNs, browser privacy features) and creates a privacy footprint with no real benefit when the app already requires sign-in. Per-user storage in Lovable Cloud is the better answer and it follows the rest of the app's auth model.

Shape:

```text
ai_chat_threads
  id uuid pk
  user_id uuid -> auth.users (RLS: auth.uid() = user_id)
  agent text ('column_advisor' | 'troubleshooting')
  title text  -- first user message, truncated
  created_at, updated_at

ai_chat_messages
  id uuid pk
  thread_id uuid -> ai_chat_threads
  role text ('user' | 'assistant')
  parts jsonb     -- AI SDK UIMessage parts
  created_at
```

RLS scopes every read/write to `auth.uid()`. GRANTs to `authenticated` and `service_role`. Both tables follow the project's standard four-step pattern (CREATE → GRANT → ENABLE RLS → CREATE POLICY).

## History UI

A **History** popover button next to Clear opens a list of past threads for that agent (newest first, titled by first prompt). Clicking a thread loads its messages back into the chat. A **New chat** action starts a fresh thread. Active messages are persisted in the background as they stream (saved on `onFinish` via server function).

Per project convention, history is kept inline in the existing page (no new route). The active thread id lives in component state for this iteration — switching is one click from the popover.

## Files

New:
- `supabase/migrations/<ts>_ai_chat_history.sql` — tables, grants, RLS, updated_at trigger
- `src/lib/ai-chat-history.functions.ts` — `listThreads`, `getThread`, `createThread`, `appendMessage`, `deleteThread` (all `requireSupabaseAuth`)
- `src/lib/ai-chat-export.ts` — `buildChatPdf(messages, title)` and `printChat(messages, title)` helpers using jsPDF
- `src/components/ai-chat/chat-toolbar.tsx` — Copy / PDF / Print / History / New / Clear buttons (shared by both agents)
- `src/components/ai-chat/history-popover.tsx` — thread list + select/delete

Edited:
- `src/routes/_authenticated/maintenance/hplc-columns.tsx` — wire toolbar + history into `AdvisorPanel`
- `src/routes/_authenticated/maintenance/troubleshooting.tsx` — wire toolbar + history
- `src/lib/query-keys.ts` — add `aiChatThreads(agent)` key

## Out of scope

- Threaded URLs (`/maintenance/troubleshooting/$threadId`) — current pages aren't thread-routed and this iteration keeps the active thread in component state per your request scope.
- Sharing threads between users.
- Exporting attachments inside the PDF (troubleshooting images will be listed by filename in the PDF, not embedded, to keep file size sane).

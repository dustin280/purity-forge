## Goal

Make the existing "fresh start" action obvious. Today the agents already have a small `+ New` button in the toolbar that starts a brand-new thread without deleting history, but it's easy to miss next to Copy/PDF/Print, so people keep chatting and the model carries old context (polar peptides) into the new question (pump seals).

## Change

One file: `src/components/ai-chat/chat-toolbar.tsx`.

- Promote the `+ New` button to a prominent **Fresh Session** button:
  - Outline variant (not ghost), with a `RefreshCw` icon.
  - Label: **Fresh Session**, tooltip: "Start a new conversation with a clean slate — your previous chats are saved under History."
  - Place it at the left edge of the toolbar so it's the first control you see.
- Behavior is unchanged: it calls the existing `onNewChat` handler, which on both agents already does `setMessages([])` + `startNew()`. That clears the in-memory conversation, drops the active thread ID, and the next message starts a fresh server-side thread with no prior context. Going back via History re-loads the old thread's messages exactly as before.
- Keep the small `Clear` button for when you just want to wipe the on-screen view without starting a new thread.

Because both Column Advisor and HPLC Troubleshooting render `<ChatToolbar />`, both get the button from the same change. No backend, no schema, no route changes.

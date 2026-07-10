## Plan: Shared PDF knowledge base for Column Advisor + Troubleshooting

You'll drop the PDFs into chat. I'll process them into a searchable knowledge base both agents can pull from.

### How it will work

1. **You upload the PDFs** in your next message (up to 20 MB / 50 pages each — larger files I'll split first).
2. **I parse each PDF** with `document--parse_document` into clean markdown (preserving tables, headings, and OCR'd text from any scanned pages).
3. **I chunk + embed** the text (~1000 chars per chunk with overlap) using `google/gemini-embedding-2` via the Lovable AI Gateway, and store in a new `ai_knowledge_docs` + `ai_knowledge_chunks` table (pgvector).
4. **Both agents get a new `searchKnowledgeBase` tool** that vector-searches those chunks and returns the top matches with source citations (doc title + page). The tool sits alongside their existing `searchWeb` / `scrapePage` tools, so the agents will prefer your vetted PDFs first and fall back to the web.
5. **Small admin page** at `/maintenance/knowledge-base` to list uploaded docs and delete any you no longer want. (No end-user upload UI, per your choice — but this makes it easy for me or you to add more later without a code change if you want.)

### Why RAG vs. inlining into the prompt

If the PDFs are short (a few pages total) I could just paste their text into the system prompt. But vendor column guides / troubleshooting handbooks are typically 50–300 pages — too big for every request (slow + expensive + hits context limits). Vector search pulls only the 5–8 most relevant chunks per question, which is faster, cheaper, and gives better answers.

### Technical details

- New migration: `ai_knowledge_docs` (id, title, source_filename, agent_scope, created_at) + `ai_knowledge_chunks` (id, doc_id, chunk_index, content, embedding vector(3072), page_number). Admin-only RLS; server functions read via service role for the tool call.
- `src/lib/knowledge-base.server.ts` — embed + insert helpers.
- `src/lib/knowledge-base.functions.ts` — `listDocs`, `deleteDoc`, `searchKnowledge(query, topK)`.
- New `searchKnowledgeBase` tool added to `src/lib/ai-agent-tools.server.ts`; wired into both `chat-column-advisor.ts` and `chat-troubleshooting.ts` system prompts (instructing them to cite the source doc + page).
- Ingestion is a one-time server function I call from a small admin form (upload → parse → chunk → embed → store). I'll run it for you once per PDF you send.
- Uses your existing Lovable AI credits for embeddings (~$0.0001 per 1K tokens; a 200-page PDF is roughly $0.02 to embed once).

### What I need from you to start

Just attach the PDFs in your next message. If you already have titles you want them displayed as (e.g. "Agilent HPLC Troubleshooting Guide 2023"), include those too.

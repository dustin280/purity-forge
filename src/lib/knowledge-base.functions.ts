/**
 * Server functions for the shared AI knowledge base.
 * - listKnowledgeDocs / deleteKnowledgeDoc: admin management
 * - ingestKnowledgeDoc: admin-only; accepts pre-extracted markdown text
 *   (I run this after parsing user-supplied PDFs with document--parse_document).
 * - searchKnowledge: authenticated vector search used by the AI agents.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgentScope = "both" | "column_advisor" | "troubleshooting";

export interface KnowledgeDoc {
  id: string;
  title: string;
  source_filename: string | null;
  agent_scope: AgentScope;
  page_count: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeMatch {
  chunk_id: string;
  doc_id: string;
  doc_title: string;
  page_number: number | null;
  content: string;
  similarity: number;
}

export const listKnowledgeDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_knowledge_docs")
      .select("id,title,source_filename,agent_scope,page_count,chunk_count,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as KnowledgeDoc[];
  });

export const deleteKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await context.supabase.from("ai_knowledge_docs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const ingestSchema = z.object({
  title: z.string().min(1).max(300),
  source_filename: z.string().max(300).optional(),
  agent_scope: z.enum(["both", "column_advisor", "troubleshooting"]).default("both"),
  page_count: z.number().int().positive().optional(),
  /** Full extracted text (markdown or plain). Will be chunked + embedded. */
  text: z.string().min(10),
});

export const ingestKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ingestSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only");

    const { chunkText, embedText, toVectorLiteral } = await import("@/lib/knowledge-base.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const chunks = chunkText(data.text);
    if (chunks.length === 0) throw new Error("No usable text after chunking");

    const { data: docRow, error: docErr } = await supabaseAdmin
      .from("ai_knowledge_docs")
      .insert({
        title: data.title,
        source_filename: data.source_filename ?? null,
        agent_scope: data.agent_scope,
        page_count: data.page_count ?? null,
        chunk_count: 0,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (docErr || !docRow) throw docErr ?? new Error("Failed to insert doc");
    const docId = docRow.id as string;

    // Embed sequentially to stay well under provider batch/rate limits.
    const rows: Array<{
      doc_id: string;
      chunk_index: number;
      content: string;
      embedding: string;
    }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const vec = await embedText(chunks[i]);
      rows.push({
        doc_id: docId,
        chunk_index: i,
        content: chunks[i],
        embedding: toVectorLiteral(vec),
      });
    }

    // Insert in batches
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error: insErr } = await supabaseAdmin
        .from("ai_knowledge_chunks")
        .insert(batch as never);
      if (insErr) {
        await supabaseAdmin.from("ai_knowledge_docs").delete().eq("id", docId);
        throw insErr;
      }
    }

    await supabaseAdmin
      .from("ai_knowledge_docs")
      .update({ chunk_count: rows.length })
      .eq("id", docId);

    return { id: docId, chunk_count: rows.length };
  });

const searchSchema = z.object({
  query: z.string().min(2).max(1000),
  scope: z.enum(["both", "column_advisor", "troubleshooting"]).optional(),
  topK: z.number().int().min(1).max(15).optional(),
});

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { embedText } = await import("@/lib/knowledge-base.server");
    const vec = await embedText(data.query);
    // Pass agent scope through; NULL scope_filter returns all
    const scopeFilter = data.scope && data.scope !== "both" ? data.scope : null;
    const { data: rows, error } = await context.supabase.rpc("match_ai_knowledge_chunks", {
      query_embedding: vec as unknown as string,
      match_count: data.topK ?? 6,
      scope_filter: scopeFilter,
    });
    if (error) throw error;
    return (rows ?? []) as unknown as KnowledgeMatch[];
  });
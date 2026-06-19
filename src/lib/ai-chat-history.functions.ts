/**
 * Server functions for per-user AI assistant chat history.
 * Each user only sees their own threads + messages (RLS-enforced).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatAgent = "column_advisor" | "troubleshooting";

export interface ChatThreadRow {
  id: string;
  agent: ChatAgent;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  parts: unknown;
  created_at: string;
}

const AgentSchema = z.enum(["column_advisor", "troubleshooting"]);

export const listChatThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agent: ChatAgent }) => ({ agent: AgentSchema.parse(d.agent) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_chat_threads")
      .select("id, agent, title, created_at, updated_at")
      .eq("agent", data.agent)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatThreadRow[];
  });

export const getChatThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { threadId: string }) => ({ threadId: z.string().uuid().parse(d.threadId) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_chat_messages")
      .select("id, thread_id, role, parts, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatMessageRow[];
  });

export const createChatThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agent: ChatAgent; title?: string }) => ({
    agent: AgentSchema.parse(d.agent),
    title: (d.title ?? "New chat").slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_chat_threads")
      .insert({ user_id: context.userId, agent: data.agent, title: data.title })
      .select("id, agent, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatThreadRow;
  });

export const appendChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    threadId: string;
    title?: string;
    messages: { role: "user" | "assistant" | "system"; parts: unknown }[];
  }) => ({
    threadId: z.string().uuid().parse(d.threadId),
    title: d.title?.slice(0, 120),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          parts: z.unknown(),
        }),
      )
      .parse(d.messages),
  }))
  .handler(async ({ data, context }) => {
    if (data.messages.length > 0) {
      const rows = data.messages.map((m) => ({
        thread_id: data.threadId,
        user_id: context.userId,
        role: m.role,
        parts: m.parts as never,
      }));
      const { error: insertErr } = await context.supabase.from("ai_chat_messages").insert(rows);
      if (insertErr) throw new Error(insertErr.message);
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title) patch.title = data.title;
    const { error: updErr } = await context.supabase
      .from("ai_chat_threads")
      .update(patch)
      .eq("id", data.threadId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

export const replaceChatThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    threadId: string;
    title?: string;
    messages: { role: "user" | "assistant" | "system"; parts: unknown }[];
  }) => ({
    threadId: z.string().uuid().parse(d.threadId),
    title: d.title?.slice(0, 120),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          parts: z.unknown(),
        }),
      )
      .parse(d.messages),
  }))
  .handler(async ({ data, context }) => {
    const { error: delErr } = await context.supabase
      .from("ai_chat_messages")
      .delete()
      .eq("thread_id", data.threadId);
    if (delErr) throw new Error(delErr.message);
    if (data.messages.length > 0) {
      const rows = data.messages.map((m) => ({
        thread_id: data.threadId,
        user_id: context.userId,
        role: m.role,
        parts: m.parts as never,
      }));
      const { error: insErr } = await context.supabase.from("ai_chat_messages").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title) patch.title = data.title;
    const { error: updErr } = await context.supabase
      .from("ai_chat_threads")
      .update(patch)
      .eq("id", data.threadId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

export const deleteChatThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { threadId: string }) => ({ threadId: z.string().uuid().parse(d.threadId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_chat_threads")
      .delete()
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
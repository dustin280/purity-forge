import { useCallback, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

import {
  type ChatAgent,
  createChatThread,
  getChatThread,
  replaceChatThreadMessages,
} from "@/lib/ai-chat-history.functions";

function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  return (text || "New chat").slice(0, 120);
}

/**
 * Per-user persistence wrapper around useChat. Auto-creates a thread on the
 * first send, then keeps the DB row in sync after each assistant turn.
 */
export function useChatPersistence(agent: ChatAgent) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const threadRef = useRef<string | null>(null);
  threadRef.current = activeThreadId;

  const qc = useQueryClient();
  const createThread = useServerFn(createChatThread);
  const getThread = useServerFn(getChatThread);
  const replace = useServerFn(replaceChatThreadMessages);

  const ensureThread = useCallback(
    async (title: string) => {
      if (threadRef.current) return threadRef.current;
      const t = await createThread({ data: { agent, title } });
      threadRef.current = t.id;
      setActiveThreadId(t.id);
      qc.invalidateQueries({ queryKey: ["ai-chat-threads", agent] });
      return t.id;
    },
    [agent, createThread, qc],
  );

  const persist = useCallback(
    async (messages: UIMessage[]) => {
      if (messages.length === 0) return;
      const title = deriveTitle(messages);
      const id = await ensureThread(title);
      await replace({
        data: {
          threadId: id,
          title,
          messages: messages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            parts: m.parts,
          })),
        },
      });
      qc.invalidateQueries({ queryKey: ["ai-chat-threads", agent] });
    },
    [agent, ensureThread, qc, replace],
  );

  const loadThread = useCallback(
    async (threadId: string): Promise<UIMessage[]> => {
      const rows = await getThread({ data: { threadId } });
      threadRef.current = threadId;
      setActiveThreadId(threadId);
      return rows.map(
        (r) =>
          ({
            id: r.id,
            role: r.role,
            parts: Array.isArray(r.parts) ? r.parts : [],
          }) as UIMessage,
      );
    },
    [getThread],
  );

  const startNew = useCallback(() => {
    threadRef.current = null;
    setActiveThreadId(null);
  }, []);

  return { activeThreadId, persist, loadThread, startNew };
}
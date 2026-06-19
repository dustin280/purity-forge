import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { UIMessage } from "ai";
import { Copy, FileDown, Printer, History, Eraser, Plus, Check, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  assistantText,
  downloadChatPdf,
  printChat,
  uiMessagesToExport,
} from "@/lib/ai-chat-export";
import {
  type ChatAgent,
  type ChatThreadRow,
  deleteChatThread,
  listChatThreads,
} from "@/lib/ai-chat-history.functions";

interface Props {
  agent: ChatAgent;
  agentLabel: string;
  messages: UIMessage[];
  isLoading: boolean;
  onNewChat: () => void;
  onClear: () => void;
  onSelectThread: (threadId: string) => void;
  activeThreadId: string | null;
}

export function ChatToolbar({
  agent,
  agentLabel,
  messages,
  isLoading,
  onNewChat,
  onClear,
  onSelectThread,
  activeThreadId,
}: Props) {
  const hasMessages = messages.length > 0;
  const hasAssistant = messages.some((m) => m.role === "assistant");

  const onCopy = async () => {
    const text = assistantText(messages);
    if (!text) {
      toast.error("No assistant response to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied assistant response to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const onPdf = async () => {
    if (!hasMessages) return;
    try {
      await downloadChatPdf(agentLabel, uiMessagesToExport(messages));
    } catch (e) {
      toast.error(`PDF failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onPrint = () => {
    if (!hasMessages) return;
    printChat(agentLabel, uiMessagesToExport(messages));
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Button size="sm" variant="ghost" onClick={onCopy} disabled={!hasAssistant} title="Copy assistant response">
        <Copy className="size-3 mr-1" /> Copy
      </Button>
      <Button size="sm" variant="ghost" onClick={onPdf} disabled={!hasMessages} title="Download as PDF">
        <FileDown className="size-3 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="ghost" onClick={onPrint} disabled={!hasMessages} title="Print conversation">
        <Printer className="size-3 mr-1" /> Print
      </Button>
      <HistoryButton
        agent={agent}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
      />
      <Button size="sm" variant="ghost" onClick={onNewChat} disabled={isLoading} title="Start a new conversation">
        <Plus className="size-3 mr-1" /> New
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={!hasMessages || isLoading} title="Clear current view">
        <Eraser className="size-3 mr-1" /> Clear
      </Button>
    </div>
  );
}

function HistoryButton({
  agent,
  activeThreadId,
  onSelectThread,
}: {
  agent: ChatAgent;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = useServerFn(listChatThreads);
  const del = useServerFn(deleteChatThread);
  const qc = useQueryClient();

  const threadsQuery = useQuery({
    queryKey: ["ai-chat-threads", agent],
    queryFn: () => list({ data: { agent } }),
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { threadId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-chat-threads", agent] });
      toast.success("Conversation deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="View past conversations">
          <History className="size-3 mr-1" /> History
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="text-sm font-semibold">Past conversations</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Saved to your account — only you can see them.
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {threadsQuery.isLoading && (
            <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" /> Loading…
            </div>
          )}
          {threadsQuery.isError && (
            <div className="p-4 text-xs text-destructive">
              {threadsQuery.error instanceof Error ? threadsQuery.error.message : "Failed to load"}
            </div>
          )}
          {threadsQuery.data && threadsQuery.data.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">No saved conversations yet.</div>
          )}
          {threadsQuery.data?.map((t: ChatThreadRow) => {
            const active = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`flex items-start gap-1 px-3 py-2 border-b last:border-b-0 ${active ? "bg-muted/50" : "hover:bg-muted/30"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectThread(t.id);
                    setOpen(false);
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-1">
                    {active && <Check className="size-3 text-primary shrink-0" />}
                    <div className="text-sm truncate">{t.title || "Untitled"}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(t.updated_at).toLocaleString()}
                  </div>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  disabled={deleteMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this conversation?")) deleteMutation.mutate(t.id);
                  }}
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
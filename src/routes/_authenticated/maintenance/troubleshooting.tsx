import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Send, Paperclip, X, Stethoscope } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChatToolbar } from "@/components/ai-chat/chat-toolbar";
import { useChatPersistence } from "@/components/ai-chat/use-chat-persistence";
import { AiCreditsBadge } from "@/components/ai-chat/ai-credits-badge";

export const Route = createFileRoute("/_authenticated/maintenance/troubleshooting")({
  component: Troubleshooting,
});

type Attachment = { file: File; dataUrl: string };

const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB each

function Troubleshooting() {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat-troubleshooting" }),
    [],
  );
  const { activeThreadId, persist, loadThread, startNew } = useChatPersistence("troubleshooting");
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onFinish: ({ messages: ms }) => { void persist(ms); },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  const onPickFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const next: Attachment[] = [...attachments];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_FILES) {
        toast.error(`Max ${MAX_FILES} images per message`);
        break;
      }
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name}: only image files are supported`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: max 8 MB per image`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      next.push({ file: f, dataUrl });
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) await onPickFiles(files);
  };

  const removeAttachment = (i: number) => {
    setAttachments(a => a.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isLoading) return;
    const files = attachments.map(a => ({
      type: "file" as const,
      mediaType: a.file.type,
      url: a.dataUrl,
      filename: a.file.name,
    }));
    setInput("");
    setAttachments([]);
    await sendMessage({ text: text || "Please analyze the attached chromatogram(s).", files });
    taRef.current?.focus();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <Link to="/maintenance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Maintenance
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <div className="size-10 rounded-md bg-muted grid place-items-center shrink-0">
            <Stethoscope className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">HPLC Troubleshooting</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Describe your problem or attach a chromatogram screenshot. The AI expert will diagnose analysis issues and instrument malfunctions.
            </p>
          </div>
        </div>
      </div>

      <Card className="p-4 border-primary/30">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-semibold">Troubleshooting Advisor</h2>
            <span className="text-xs text-muted-foreground">AI-powered · vision-capable</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AiCreditsBadge />
            <ChatToolbar
            agent="troubleshooting"
            agentLabel="HPLC Troubleshooting"
            messages={messages}
            isLoading={isLoading}
            activeThreadId={activeThreadId}
            onNewChat={() => { setMessages([]); setAttachments([]); startNew(); taRef.current?.focus(); }}
            onClear={() => setMessages([])}
            onSelectThread={async (id) => {
              try {
                const msgs = await loadThread(id);
                setMessages(msgs);
              } catch (e) {
                console.error(e);
              }
            }}
          />
          </div>
        </div>

        <div
          ref={scrollRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border rounded-md bg-muted/20 p-3 mb-3 max-h-[720px] min-h-[320px] overflow-y-auto space-y-4 transition-colors ${isDragging ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}
        >
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Tell me what's happening and I'll help diagnose it. Drag &amp; drop images anywhere in this box, or use the paperclip. Useful context:</p>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Instrument (e.g. Agilent 1260, Waters Acquity) and column</li>
                <li>Mobile phase + pH, flow rate, detector</li>
                <li>What changed or when the issue started</li>
                <li>Attach chromatogram screenshots, error codes, or photos of leaks/parts</li>
              </ul>
            </div>
          )}
          {messages.map(m => (
            <MessageView key={m.id} message={m} />
          ))}
          {status === "submitted" && (
            <div className="text-xs text-muted-foreground italic">Thinking…</div>
          )}
          {error && (
            <div className="text-xs text-destructive">Error: {error.message}</div>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative border rounded-md overflow-hidden bg-muted">
                <img src={a.dataUrl} alt={a.file.name} className="h-20 w-20 object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="absolute top-0.5 right-0.5 bg-background/80 rounded p-0.5 hover:bg-background"
                  aria-label="Remove image"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => onPickFiles(e.target.files)}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || attachments.length >= MAX_FILES}
            title="Attach chromatogram image"
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="e.g. Peaks are tailing badly on a C18 at pH 3.0, started after the last solvent change…"
            className="min-h-[60px] resize-none"
            disabled={isLoading}
          />
          <Button onClick={submit} disabled={(!input.trim() && attachments.length === 0) || isLoading}>
            <Send className="size-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function MessageView({ message }: { message: ReturnType<typeof useChat>["messages"][number] }) {
  const text = message.parts.map(p => (p.type === "text" ? p.text : "")).join("");
  const images = message.parts.flatMap(p =>
    p.type === "file" && typeof p.mediaType === "string" && p.mediaType.startsWith("image/") && typeof p.url === "string"
      ? [{ url: p.url, name: (p as { filename?: string }).filename ?? "image" }]
      : [],
  );
  return (
    <div className="text-sm">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {message.role === "user" ? "You" : "Advisor"}
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, i) => (
            <a key={i} href={img.url} target="_blank" rel="noopener noreferrer">
              <img src={img.url} alt={img.name} className="max-h-48 rounded-md border" />
            </a>
          ))}
        </div>
      )}
      {message.role === "user" ? (
        text && <div className="whitespace-pre-wrap">{text}</div>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
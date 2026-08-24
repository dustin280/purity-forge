import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Clock, Eye, FileDown, Pencil, Save, Trash2, X } from "lucide-react";
import { downloadJournalPdf } from "@/lib/journal-pdf";
import type { LabJournalEntry } from "@/lib/lab-journal.functions";
import { TagInput } from "./tag-input";
import { MarkdownView } from "./markdown-view";
import { AttachmentPanel } from "./attachment-panel";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput() {
  return toLocalInput(new Date().toISOString());
}

const DRAFT_KEY = "lab-journal-draft-v1";

export interface EntryFormProps {
  defaultUserName: string;
  userId: string | null;
  editing: LabJournalEntry | null;
  saving: boolean;
  deleting: boolean;
  onSubmit: (payload: {
    entry_at: string;
    title: string | null;
    body: string;
    user_name: string;
    tags: string[];
  }) => Promise<LabJournalEntry> | LabJournalEntry;
  onDelete?: () => void;
  onCancelEdit: () => void;
}

export function EntryForm({
  defaultUserName,
  userId,
  editing,
  saving,
  deleting,
  onSubmit,
  onDelete,
  onCancelEdit,
}: EntryFormProps) {
  const [entryAt, setEntryAt] = useState(nowLocalInput());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const initialized = useRef(false);
  const submittingRef = useRef(false);

  // On open: prefill date/time with NOW for new entries, load editing entry,
  // or restore localStorage draft for new entries.
  useEffect(() => {
    if (editing) {
      setEntryAt(toLocalInput(editing.entry_at));
      setTitle(editing.title ?? "");
      setBody(editing.body ?? "");
      setTags(editing.tags ?? []);
      initialized.current = true;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw) as {
            entry_at?: string;
            title?: string;
            body?: string;
            tags?: string[];
          };
          if (draft.entry_at) setEntryAt(draft.entry_at);
          if (draft.title) setTitle(draft.title);
          if (draft.body) setBody(draft.body);
          if (Array.isArray(draft.tags)) setTags(draft.tags);
          return;
        }
      } catch {
        /* ignore corrupt draft */
      }
    }
    setEntryAt(nowLocalInput());
  }, [editing]);

  // Auto-save draft (new entries only) to localStorage.
  useEffect(() => {
    if (editing) return;
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ entry_at: entryAt, title, body, tags }),
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [editing, entryAt, title, body, tags]);

  const reset = () => {
    setEntryAt(nowLocalInput());
    setTitle("");
    setBody("");
    setTags([]);
    setPreview(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  };

  const payload = useMemo(
    () => ({
      entry_at: new Date(entryAt).toISOString(),
      title: title.trim() ? title.trim() : null,
      body,
      user_name: defaultUserName || "Unknown",
      tags,
    }),
    [entryAt, title, body, defaultUserName, tags],
  );

  const insertTimestamp = () => {
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n" : ""}[${ts}] `);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}[${ts}] ${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ts.length + 3; // "[hh:mm] "
      el.setSelectionRange(pos, pos);
    });
  };

  const canSave = body.trim().length > 0 && !saving;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {editing ? "Edit entry" : "New entry"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Only you and admins can read your journal.
          </p>
        </div>
        {editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onCancelEdit();
              reset();
            }}
          >
            <X className="size-4 mr-1" /> Cancel edit
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lj-date">Date &amp; time</Label>
          <Input
            id="lj-date"
            type="datetime-local"
            value={entryAt}
            onChange={(e) => setEntryAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lj-title">Title / subject (optional)</Label>
          <Input
            id="lj-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SS-31 method scouting, attempt 2"
            maxLength={200}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="lj-body">Entry (Markdown supported)</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertTimestamp}
              disabled={preview}
            >
              <Clock className="size-4 mr-1" /> Insert time
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? (
                <>
                  <Pencil className="size-4 mr-1" /> Edit
                </>
              ) : (
                <>
                  <Eye className="size-4 mr-1" /> Preview
                </>
              )}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="min-h-[420px] rounded-md border bg-background p-4 overflow-auto">
            {body.trim() ? (
              <MarkdownView source={body} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview.</p>
            )}
          </div>
        ) : (
          <Textarea
            id="lj-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Free-write observations, decisions, results, next steps…  Markdown like **bold**, lists, and tables works."
            rows={18}
            className="min-h-[420px] font-mono text-sm leading-relaxed"
            maxLength={50000}
          />
        )}
        <div className="text-[11px] text-muted-foreground text-right">
          {body.length.toLocaleString()} / 50,000
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} />
        <p className="text-[11px] text-muted-foreground">
          Press Enter or comma to add. Up to 20 tags, 40 characters each.
        </p>
      </div>

      <AttachmentPanel
        entryId={editing ? editing.id : null}
        userId={userId}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          disabled={!canSave}
          onClick={async () => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            try {
              await onSubmit(payload);
              if (!editing) reset();
            } finally {
              submittingRef.current = false;
            }
          }}
        >
          <Save className="size-4 mr-1" />
          {saving ? "Saving…" : editing ? "Save changes" : "Save entry"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canSave}
          onClick={async () => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            try {
              const saved = await onSubmit(payload);
              downloadJournalPdf({ ...payload, entry_number: saved.entry_number });
              if (!editing) reset();
            } finally {
              submittingRef.current = false;
            }
          }}
        >
          <FileDown className="size-4 mr-1" /> Save &amp; export PDF
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => downloadJournalPdf({ ...payload, entry_number: editing?.entry_number ?? "DRAFT — not yet saved" })}
          disabled={body.trim().length === 0}
        >
          <FileDown className="size-4 mr-1" /> Export PDF only
        </Button>
        {editing && onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive ml-auto"
            disabled={deleting}
            onClick={() => {
              if (window.confirm("Delete this journal entry? This cannot be undone.")) {
                onDelete();
              }
            }}
          >
            <Trash2 className="size-4 mr-1" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
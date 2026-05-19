import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, Paperclip, X, NotebookPen, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  listIssueReports,
  createIssueReport,
  recordIssueAttachment,
  signIssueAttachmentUrl,
  updateIssueStatus,
  type IssueAttachmentRow,
} from "@/lib/issue-reports.functions";

export const Route = createFileRoute("/_authenticated/issues/")({
  component: IssuesPage,
});

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function IssuesPage() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || user?.email || "";

  const list = useServerFn(listIssueReports);
  const create = useServerFn(createIssueReport);
  const record = useServerFn(recordIssueAttachment);
  const updateStatus = useServerFn(updateIssueStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["issue-reports"],
    queryFn: () => list(),
  });

  const issues = data?.issues ?? [];
  const attachments = data?.attachments ?? [];
  const attsByIssue = useMemo(() => {
    const m = new Map<string, IssueAttachmentRow[]>();
    for (const a of attachments) {
      const arr = m.get(a.issue_id) ?? [];
      arr.push(a);
      m.set(a.issue_id, arr);
    }
    return m;
  }, [attachments]);

  // form state
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [userName, setUserName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const issue = await create({
        data: { occurred_at: occurredAt, user_name: userName.trim(), description: description.trim() },
      });
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "upload";
        const path = `${issue.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("issue-reports")
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw upErr;
        await record({
          data: {
            issue_id: issue.id,
            file_path: path,
            file_name: file.name,
            content_type: file.type || null,
            size_bytes: file.size,
          },
        });
      }
      return issue;
    },
    onSuccess: () => {
      toast.success("Issue submitted");
      setDescription("");
      setFiles([]);
      setOccurredAt(nowLocal());
      qc.invalidateQueries({ queryKey: ["issue-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (args: { id: string; status: "open" | "in_progress" | "resolved" }) =>
      updateStatus({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-reports"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Please describe the issue");
      return;
    }
    if (!userName.trim()) {
      toast.error("Your name is required");
      return;
    }
    submit.mutate();
  }

  function appendFiles(picked: FileList | null) {
    if (!picked) return;
    const arr = Array.from(picked);
    if (arr.length) setFiles((prev) => [...prev, ...arr]);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Notes</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Notes & Issues</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Report problems, observations, or maintenance items. Attach files or capture a photo on the spot.
        </p>
      </div>

      <Card className="p-5 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Date & time</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">User</Label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                maxLength={255}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Describe the issue</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={8000}
              placeholder="What happened? Include instrument, sample, or method context."
              className="mt-1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Attachments</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="size-4 mr-1" /> Attach files
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
                <Camera className="size-4 mr-1" /> Take photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  appendFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  appendFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs rounded-md border px-2 py-1">
                    <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit issue"}
            </Button>
          </div>
        </form>
      </Card>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent</h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : issues.length === 0 ? (
        <Card className="p-10 text-center">
          <NotebookPen className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No issues submitted yet.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((iss) => (
            <IssueCard
              key={iss.id}
              issue={iss}
              attachments={attsByIssue.get(iss.id) ?? []}
              onStatus={(status) => setStatus.mutate({ id: iss.id, status })}
              signUrl={async (path) => (await signIssueAttachmentUrl({ data: { path } })).url}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "resolved") return "default";
  if (s === "in_progress") return "secondary";
  return "outline";
}

function IssueCard({
  issue,
  attachments,
  onStatus,
  signUrl,
}: {
  issue: { id: string; occurred_at: string; user_name: string; description: string; status: string; created_at: string };
  attachments: IssueAttachmentRow[];
  onStatus: (s: "open" | "in_progress" | "resolved") => void;
  signUrl: (path: string) => Promise<string>;
}) {
  async function open(path: string) {
    try {
      const url = await signUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const next: Record<string, "open" | "in_progress" | "resolved"> = {
    open: "in_progress",
    in_progress: "resolved",
    resolved: "open",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant(issue.status)}>{issue.status.replace("_", " ")}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(issue.occurred_at).toLocaleString()} · {issue.user_name}
            </span>
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words">{issue.description}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStatus(next[issue.status] ?? "open")}
          title="Cycle status"
        >
          Mark {next[issue.status] ?? "open"}
        </Button>
      </div>
      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => open(a.file_path)}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors"
            >
              {a.content_type?.startsWith("image/") ? <Camera className="size-3.5" /> : <Download className="size-3.5" />}
              <span className="truncate max-w-[200px]">{a.file_name}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
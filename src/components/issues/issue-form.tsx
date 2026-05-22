import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Paperclip, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createIssueReport, recordIssueAttachment } from "@/lib/issue-reports.functions";
import { qk } from "@/lib/query-keys";

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Issue submission form. Owns its own draft state plus the multi-step
 * "create issue, then upload + record each attachment" mutation so the
 * parent route stays a pure list orchestrator.
 */
export function IssueForm({ defaultName }: { defaultName: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createIssueReport);
  const record = useServerFn(recordIssueAttachment);

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
      qc.invalidateQueries({ queryKey: qk.issues.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Please describe the issue");
    if (!userName.trim()) return toast.error("Your name is required");
    submit.mutate();
  }

  function appendFiles(picked: FileList | null) {
    if (!picked) return;
    const arr = Array.from(picked);
    if (arr.length) setFiles((prev) => [...prev, ...arr]);
  }

  return (
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
                  <span className="truncate">
                    {f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
                  </span>
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
  );
}
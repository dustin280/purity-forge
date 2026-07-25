import { useCallback, useState, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  SP_ATTACHMENT_KINDS,
  deleteRecordAttachment,
  listRecordAttachments,
  recordRecordAttachment,
  signRecordAttachmentUrl,
  type SpAttachmentKind,
  type SpAttachmentRow,
} from "@/lib/sample-prep/record-attachments.functions";

/**
 * Attachment panel for a sample-prep record. Uploads to the
 * `sample-preparations` bucket, records metadata via server fns,
 * and mints signed URLs on open. Supports drag-and-drop.
 */
export function PrepRecordAttachments({
  recordId,
  canEdit,
}: {
  recordId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listRecordAttachments);
  const record = useServerFn(recordRecordAttachment);
  const del = useServerFn(deleteRecordAttachment);
  const sign = useServerFn(signRecordAttachmentUrl);
  const [kind, setKind] = useState<SpAttachmentKind>("weighing");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const queryKey = ["sp-record-attachments", recordId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => list({ data: { record_id: recordId } }),
  });
  const attachments: SpAttachmentRow[] = q.data ?? [];

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const f of arr) {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${recordId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("sample-preparations")
          .upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: {
            record_id: recordId,
            kind,
            file_path: path,
            file_name: f.name,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success(arr.length === 1 ? "Uploaded" : `Uploaded ${arr.length} files`);
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [recordId, kind, record, qc, queryKey]);

  async function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length) await uploadFiles(files);
    e.target.value = "";
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!canEdit) return;
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }
  async function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!canEdit) return;
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) await uploadFiles(e.dataTransfer.files);
  }

  async function openFile(path: string) {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeAttachment(id: string) {
    try {
      await del({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card
      className={`p-5 transition-colors ${dragActive ? "ring-2 ring-primary/60 bg-primary/5" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Attachments
        </h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as SpAttachmentKind)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SP_ATTACHMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleInput}
                disabled={uploading}
              />
              <Button asChild size="sm" disabled={uploading}>
                <span>
                  <Upload className="size-4 mr-1" /> {uploading ? "Uploading…" : "Upload"}
                </span>
              </Button>
            </label>
          </div>
        )}
      </div>
      {canEdit && (
        <p className="text-xs text-muted-foreground mb-3">
          Drag & drop files here, or use Upload. Files attach as “{kind}”.
        </p>
      )}
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No attachments yet.</div>
      ) : (
        <ul className="divide-y">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <button
                onClick={() => openFile(a.file_path)}
                className="flex-1 min-w-0 text-left text-sm hover:underline truncate"
              >
                {a.file_name}
              </button>
              <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(a.uploaded_at).toLocaleDateString()}
              </span>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeAttachment(a.id)}
                  className="text-destructive size-7"
                >
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
import { useCallback, useState, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteNonchromAttachment, listNonchromAttachments, recordNonchromAttachment, signNonchromAttachmentUrl,
  type NonchromAttachmentRow,
} from "@/lib/lims/nonchrom-attachments.functions";
import { assertUploadable } from "@/lib/upload-validation";

/**
 * Attachment list for a non-chromatography test (heavy-metals "attach sub
 * report" today). Mirrors PrepRecordAttachments — uploads to the
 * `nonchrom-tests` bucket, records metadata via server fns, mints signed
 * URLs on open. Keyed to test_id so a report can be dropped in independent
 * of whether a result row has been saved yet.
 */
export function NonchromAttachmentsPanel({ testId, canEdit }: { testId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listNonchromAttachments);
  const record = useServerFn(recordNonchromAttachment);
  const del = useServerFn(deleteNonchromAttachment);
  const sign = useServerFn(signNonchromAttachmentUrl);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const queryKey = ["nonchrom-attachments", testId] as const;
  const q = useQuery({ queryKey, queryFn: () => list({ data: { test_id: testId } }) });
  const attachments: NonchromAttachmentRow[] = q.data ?? [];

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const f of arr) {
        assertUploadable(f);
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${testId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("nonchrom-tests").upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: { test_id: testId, kind: "lab_report", file_path: path, file_name: f.name, content_type: f.type || null, size_bytes: f.size },
        });
      }
      toast.success(arr.length === 1 ? "Uploaded" : `Uploaded ${arr.length} files`);
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [testId, record, qc, queryKey]);

  async function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length) await uploadFiles(files);
    e.target.value = "";
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) { if (canEdit) { e.preventDefault(); setDragActive(true); } }
  function onDragLeave(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragActive(false); }
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
    } catch (err) { toast.error((err as Error).message); }
  }
  async function removeAttachment(id: string) {
    try {
      await del({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey });
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${dragActive ? "ring-2 ring-primary/60 bg-primary/5 border-primary/40" : "border-border"}`}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">Sub Report Attachments</h4>
        {canEdit && (
          <label className="inline-flex">
            <input type="file" multiple className="hidden" onChange={handleInput} disabled={uploading} />
            <Button asChild size="sm" variant="outline" disabled={uploading}>
              <span><Upload className="size-3.5 mr-1" /> {uploading ? "Uploading…" : "Attach sub report"}</span>
            </Button>
          </label>
        )}
      </div>
      {q.isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No attachments yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {attachments.map(a => (
            <li key={a.id} className="flex items-center gap-2 py-1.5">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <button onClick={() => openFile(a.file_path)} className="flex-1 min-w-0 text-left text-xs hover:underline truncate">
                {a.file_name}
              </button>
              <Badge variant="outline" className="text-[9px]">{a.kind}</Badge>
              <span className="text-[10px] text-muted-foreground">{new Date(a.uploaded_at).toLocaleDateString()}</span>
              {canEdit && (
                <Button size="icon" variant="ghost" onClick={() => removeAttachment(a.id)} className="text-destructive size-6">
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

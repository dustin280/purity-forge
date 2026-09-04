import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, FileText, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  PREP_ATTACHMENT_KINDS,
  deletePrepAttachment,
  recordPrepAttachment,
  signPrepAttachmentUrl,
  type PrepAttachmentKind,
} from "@/lib/standard-preparations.functions";
import { qk } from "@/lib/query-keys";
import { assertUploadable } from "@/lib/upload-validation";

export type PrepAttachmentRow = {
  id: string;
  kind: PrepAttachmentKind;
  file_path: string;
  file_name: string;
  uploaded_at: string;
};

/**
 * Self-contained attachment list for a standard preparation: uploads to the
 * `standard-preparations` bucket, records metadata via server fns, and lazily
 * signs URLs when opening files. "Take photo" opens the device camera on
 * phones/tablets (a plain image picker on desktops) and files as `photo`;
 * "Upload file" takes anything. Attaching stays possible after approval —
 * weighing slips and photos often arrive later — while removing is only
 * allowed while the record is still editable.
 */
export function PrepAttachments({
  logId,
  attachments,
  canAttach,
  canRemove,
}: {
  logId: string;
  attachments: PrepAttachmentRow[];
  canAttach: boolean;
  canRemove: boolean;
}) {
  const qc = useQueryClient();
  const record = useServerFn(recordPrepAttachment);
  const del = useServerFn(deletePrepAttachment);
  const sign = useServerFn(signPrepAttachmentUrl);
  const [kind, setKind] = useState<PrepAttachmentKind>("weighing");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null, asKind: PrepAttachmentKind) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        // No MIME allowlist — this bucket may receive raw instrument-export
        // formats; only the size cap (mirrors the storage.buckets migration) applies.
        assertUploadable(f);
        const safeName = (f.name || `photo-${Date.now()}.jpg`).replace(/[^\w.-]+/g, "_");
        const path = `${logId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("standard-preparations")
          .upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: {
            log_id: logId,
            kind: asKind,
            file_path: path,
            file_name: f.name || safeName,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success(files.length === 1 ? "Attached" : `Attached ${files.length} files`);
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(logId) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    void upload(e.target.files, kind);
    e.target.value = "";
  }
  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    void upload(e.target.files, "photo");
    e.target.value = "";
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
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(logId) });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Attachments
        </h2>
        {canAttach && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={kind} onValueChange={(v) => setKind(v as PrepAttachmentKind)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREP_ATTACHMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-4 mr-1" /> Take photo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4 mr-1" /> {uploading ? "Uploading…" : "Upload file"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onPickFiles}
              disabled={uploading}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={onPhoto}
              disabled={uploading}
            />
          </div>
        )}
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          {canAttach
            ? "No attachments yet — take a photo or upload a file."
            : "No attachments yet."}
        </div>
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
              <Badge variant="outline" className="text-[10px]">
                {a.kind}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(a.uploaded_at).toLocaleDateString()}
              </span>
              {canRemove && (
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

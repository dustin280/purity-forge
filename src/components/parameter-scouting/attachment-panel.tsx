import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown, Paperclip, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteScoutingAttachment,
  listScoutingAttachments,
  recordScoutingAttachment,
  signScoutingAttachment,
  type ParameterScoutingAttachment,
} from "@/lib/parameter-scouting-attachments.functions";
import { qk } from "@/lib/query-keys";

const BUCKET = "parameter-scouting-attachments";
const MAX_FILES = 10;
const MAX_SIZE = 20 * 1024 * 1024;

function humanSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export interface ScoutingAttachmentPanelProps {
  entryId: string | null;
  userId: string | null;
}

export function ScoutingAttachmentPanel({
  entryId,
  userId,
}: ScoutingAttachmentPanelProps) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const list = useServerFn(listScoutingAttachments);
  const record = useServerFn(recordScoutingAttachment);
  const sign = useServerFn(signScoutingAttachment);
  const del = useServerFn(deleteScoutingAttachment);

  const query = useQuery({
    queryKey: entryId
      ? qk.parameterScoutingAttachments.list(entryId)
      : ["parameter-scouting-attachments", "none"],
    queryFn: () => list({ data: { entry_id: entryId as string } }),
    enabled: !!entryId,
  });

  const rows = useMemo<ParameterScoutingAttachment[]>(
    () => query.data ?? [],
    [query.data],
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Attachment removed");
      if (entryId)
        qc.invalidateQueries({
          queryKey: qk.parameterScoutingAttachments.list(entryId),
        });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!entryId || !userId) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Paperclip className="size-4" />
        Save the entry first to attach files.
      </div>
    );
  }

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (rows.length + files.length > MAX_FILES) {
      toast.error(`Max ${MAX_FILES} files per entry`);
      return;
    }
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_SIZE) {
          toast.error(`${f.name} exceeds 20 MB`);
          continue;
        }
        const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const path = `${userId}/${entryId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, {
            contentType: f.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          toast.error(`${f.name}: ${upErr.message}`);
          continue;
        }
        await record({
          data: {
            entry_id: entryId,
            file_path: path,
            file_name: f.name,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success("Uploaded");
      qc.invalidateQueries({
        queryKey: qk.parameterScoutingAttachments.list(entryId),
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const download = async (id: string) => {
    try {
      const { url, file_name } = await sign({ data: { id } });
      const a = document.createElement("a");
      a.href = url;
      a.download = file_name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="rounded-md border bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="size-4" /> Attachments
          <span className="text-xs text-muted-foreground font-normal">
            ({rows.length}/{MAX_FILES})
          </span>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading || rows.length >= MAX_FILES}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4 mr-1" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No attachments. Max 20 MB per file.
        </div>
      ) : (
        <ul className="divide-y border rounded-md bg-background">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{r.file_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.content_type || "file"} · {humanSize(r.size_bytes)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => download(r.id)}
                aria-label="Download"
              >
                <FileDown className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${r.file_name}?`))
                    deleteMut.mutate(r.id);
                }}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
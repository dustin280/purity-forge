import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, X } from "lucide-react";
import {
  deleteAttachment,
  recordAttachment,
  signAttachmentUrl,
  type AttachmentKind,
  ATTACHMENT_KINDS,
} from "@/lib/material-receipts.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";

type AttachmentRow = {
  id: string;
  kind: AttachmentKind;
  file_path: string;
  file_name: string;
  uploaded_at: string;
};

/**
 * Renders the attachment list for a material receipt and handles upload,
 * preview (signed-URL open), and removal. Self-contained: invalidates the
 * receipt detail query on its own so the parent route doesn't need to wire
 * cache updates.
 */
export function AttachmentsSection({
  receiptId,
  attachments,
  canEdit,
}: {
  receiptId: string;
  attachments: AttachmentRow[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const record = useServerFn(recordAttachment);
  const del = useServerFn(deleteAttachment);
  const sign = useServerFn(signAttachmentUrl);
  const [kind, setKind] = useState<AttachmentKind>("coa");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${receiptId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("material-receipts").upload(path, f);
        if (upErr) throw upErr;
        await record({
          data: {
            receipt_id: receiptId,
            kind,
            file_path: path,
            file_name: f.name,
            content_type: f.type || null,
            size_bytes: f.size,
          },
        });
      }
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(receiptId) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(receiptId) });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={v => setKind(v as AttachmentKind)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTACHMENT_KINDS.map(k => (
                  <SelectItem key={k} value={k}>{k.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex">
              <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
              <Button asChild size="sm" disabled={uploading}>
                <span><Upload className="size-4 mr-1" /> {uploading ? "Uploading…" : "Upload"}</span>
              </Button>
            </label>
          </div>
        )}
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No attachments yet.</div>
      ) : (
        <ul className="divide-y">
          {attachments.map(a => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <button onClick={() => openFile(a.file_path)} className="flex-1 min-w-0 text-left text-sm hover:underline truncate">
                {a.file_name}
              </button>
              <Badge variant="outline" className="uppercase text-[10px]">{a.kind}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(a.uploaded_at).toLocaleDateString()}</span>
              {canEdit && (
                <Button size="icon" variant="ghost" onClick={() => removeAttachment(a.id)} className="text-destructive size-7">
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
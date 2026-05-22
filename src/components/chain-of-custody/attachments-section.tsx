/**
 * Package-condition photos + attachments block used inside the CoC form
 * dialog. Handles file picker + camera capture, lists existing server-side
 * attachments, and shows locally pending (not-yet-uploaded) files.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, X, ImageIcon } from "lucide-react";
import type { CocAttachmentRow } from "./types";

export function AttachmentsSection({
  attachments, pendingFiles, onAddFiles, onRemovePending, onDeleteExisting, onOpenExisting,
}: {
  attachments: CocAttachmentRow[];
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemovePending: (idx: number) => void;
  onDeleteExisting: (id: string) => void;
  onOpenExisting: (path: string) => void;
}) {
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
      <Label className="text-sm font-semibold">Package photos & attachments</Label>
      <p className="text-xs text-muted-foreground mb-2">
        Document the package condition. Upload an image or take a photo with your camera.
      </p>
      <div className="flex gap-2 mb-3">
        <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
          <Upload className="size-3.5 mr-1" /> Upload image
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera className="size-3.5 mr-1" /> Take photo
        </Button>
        <input ref={uploadRef} type="file" accept="image/*" multiple hidden
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onAddFiles(fs); e.target.value = ""; }} />
      </div>
      {(attachments.length === 0 && pendingFiles.length === 0) ? (
        <div className="text-xs text-muted-foreground italic">No attachments yet.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              <button type="button" className="hover:underline truncate max-w-[160px]" onClick={() => onOpenExisting(a.file_path)}>
                {a.file_name}
              </button>
              <button type="button" onClick={() => onDeleteExisting(a.id)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <Badge variant="outline" className="text-[9px]">pending</Badge>
              <button type="button" onClick={() => onRemovePending(i)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
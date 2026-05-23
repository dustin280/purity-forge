import { Button } from "@/components/ui/button";
import { Paperclip, X } from "lucide-react";

export function FileSlot({
  title,
  files,
  existing,
  onPick,
  onRemove,
}: {
  title: string;
  files: File[];
  existing: boolean;
  onPick: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">
            {existing
              ? "Already attached — add more if needed"
              : files.length === 0
                ? "No file selected"
                : `${files.length} file${files.length === 1 ? "" : "s"} ready to upload`}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onPick}>
          <Paperclip className="size-4 mr-1" /> Add file
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
              <button type="button" onClick={() => onRemove(i)} className="text-destructive hover:opacity-70">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
/**
 * "Drafts in progress" panel shown above the CoC records list. Reads from
 * localStorage (via the CoC drafts store) and lets the user resume or
 * discard each draft. Pure presentation — parent owns the resume handler.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Trash2 } from "lucide-react";
import { deleteCocDraft, type CocDraft } from "@/lib/coc-drafts";

export function DraftsPanel({
  drafts, onResume,
}: {
  drafts: CocDraft[];
  onResume: (d: CocDraft) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <Card className="mb-4 border-dashed border-primary/40 bg-primary/[0.03]">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <ClipboardList className="size-4 text-primary" />
        <div className="text-sm font-medium">Drafts in progress</div>
        <Badge variant="secondary" className="text-[10px]">{drafts.length}</Badge>
        <span className="text-xs text-muted-foreground ml-1">Auto-saved in this browser.</span>
      </div>
      <ul className="divide-y divide-border">
        {drafts.map(d => (
          <li key={d.draftId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {d.summary || (d.recordId ? "Editing existing record" : "New chain of custody")}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.recordId ? "Edit draft" : "New CoC draft"} · saved {new Date(d.updatedAt).toLocaleString()}
                {d.pendingFileNames.length > 0 && ` · ${d.pendingFileNames.length} photo${d.pendingFileNames.length === 1 ? "" : "s"} pending (re-attach on resume)`}
              </div>
            </div>
            <Button size="sm" variant="default" onClick={() => onResume(d)}>Resume</Button>
            <Button
              size="icon" variant="ghost"
              onClick={() => { if (confirm("Discard this draft?")) deleteCocDraft(d.draftId); }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
import { toast } from "sonner";
import { Camera, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IssueAttachmentRow } from "@/lib/issue-reports.functions";

export type IssueStatus = "open" | "in_progress" | "resolved";

export type IssueRow = {
  id: string;
  occurred_at: string;
  user_name: string;
  description: string;
  status: string;
  created_at: string;
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "resolved") return "default";
  if (s === "in_progress") return "secondary";
  return "outline";
}

const NEXT_STATUS: Record<string, IssueStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "open",
};

/**
 * Single issue row with status pill, description, status-cycle action,
 * and clickable attachment chips that resolve signed URLs on demand.
 */
export function IssueCard({
  issue,
  attachments,
  onStatus,
  signUrl,
}: {
  issue: IssueRow;
  attachments: IssueAttachmentRow[];
  onStatus: (s: IssueStatus) => void;
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
  const next = NEXT_STATUS[issue.status] ?? "open";
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
        <Button variant="ghost" size="sm" onClick={() => onStatus(next)} title="Cycle status">
          Mark {next}
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
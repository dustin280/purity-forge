import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { NotebookPen } from "lucide-react";
import { IssueCard, type IssueStatus } from "./issue-card";
import {
  signIssueAttachmentUrl,
  type IssueAttachmentRow,
} from "@/lib/issue-reports.functions";

type Issue = Parameters<typeof IssueCard>[0]["issue"];

/**
 * Recent-issues list. Groups attachments by issue id, then renders an
 * IssueCard per row. Handles loading and empty states.
 */
export function IssuesList({
  issues, attachments, isLoading, onStatus,
}: {
  issues: Issue[];
  attachments: IssueAttachmentRow[];
  isLoading: boolean;
  onStatus: (id: string, status: IssueStatus) => void;
}) {
  const attsByIssue = useMemo(() => {
    const m = new Map<string, IssueAttachmentRow[]>();
    for (const a of attachments) {
      const arr = m.get(a.issue_id) ?? [];
      arr.push(a);
      m.set(a.issue_id, arr);
    }
    return m;
  }, [attachments]);

  if (isLoading) return <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>;
  if (issues.length === 0) {
    return (
      <Card className="p-10 text-center">
        <NotebookPen className="size-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">No issues submitted yet.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {issues.map((iss) => (
        <IssueCard
          key={iss.id}
          issue={iss}
          attachments={attsByIssue.get(iss.id) ?? []}
          onStatus={(status) => onStatus(iss.id, status)}
          signUrl={async (path) => (await signIssueAttachmentUrl({ data: { path } })).url}
        />
      ))}
    </div>
  );
}
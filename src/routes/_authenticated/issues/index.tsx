import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { NotebookPen } from "lucide-react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  listIssueReports,
  signIssueAttachmentUrl,
  updateIssueStatus,
  type IssueAttachmentRow,
} from "@/lib/issue-reports.functions";
import { qk } from "@/lib/query-keys";
import { IssueForm } from "@/components/issues/issue-form";
import { IssueCard, type IssueStatus } from "@/components/issues/issue-card";

export const Route = createFileRoute("/_authenticated/issues/")({
  component: IssuesPage,
});

function IssuesPage() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const defaultName = profileDisplayName(profile, user?.email) || user?.email || "";

  const list = useServerFn(listIssueReports);
  const updateStatus = useServerFn(updateIssueStatus);

  const { data, isLoading } = useQuery({
    queryKey: qk.issues.list(),
    queryFn: () => list(),
  });

  const issues = data?.issues ?? [];
  const attachments = data?.attachments ?? [];
  const attsByIssue = useMemo(() => {
    const m = new Map<string, IssueAttachmentRow[]>();
    for (const a of attachments) {
      const arr = m.get(a.issue_id) ?? [];
      arr.push(a);
      m.set(a.issue_id, arr);
    }
    return m;
  }, [attachments]);

  const setStatus = useMutation({
    mutationFn: (args: { id: string; status: IssueStatus }) => updateStatus({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.issues.list() }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Notes</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Notes & Issues</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Report problems, observations, or maintenance items. Attach files or capture a photo on the spot.
        </p>
      </div>

      <IssueForm defaultName={defaultName} />

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent</h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : issues.length === 0 ? (
        <Card className="p-10 text-center">
          <NotebookPen className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No issues submitted yet.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((iss) => (
            <IssueCard
              key={iss.id}
              issue={iss}
              attachments={attsByIssue.get(iss.id) ?? []}
              onStatus={(status) => setStatus.mutate({ id: iss.id, status })}
              signUrl={async (path) => (await signIssueAttachmentUrl({ data: { path } })).url}
            />
          ))}
        </div>
      )}
    </div>
  );
}
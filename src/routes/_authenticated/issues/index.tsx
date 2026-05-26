import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import {
  listIssueReports,
  updateIssueStatus,
} from "@/lib/issue-reports.functions";
import { qk } from "@/lib/query-keys";
import { IssueForm } from "@/components/issues/issue-form";
import { type IssueStatus } from "@/components/issues/issue-card";
import { IssuesList } from "@/components/issues/issues-list";

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

  const setStatus = useMutation({
    mutationFn: (args: { id: string; status: IssueStatus }) => updateStatus({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.issues.list() }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Notes</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Notes & Issues</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Report problems, observations, or maintenance items. Attach files or capture a photo on the spot.
        </p>
      </div>

      <IssueForm defaultName={defaultName} />

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent</h2>
      <IssuesList
        issues={data?.issues ?? []}
        attachments={data?.attachments ?? []}
        isLoading={isLoading}
        onStatus={(id, status) => setStatus.mutate({ id, status })}
      />
    </div>
  );
}
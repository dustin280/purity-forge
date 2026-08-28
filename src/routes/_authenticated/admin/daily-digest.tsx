import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listNotificationRecipients, updateNotificationRecipient } from "@/lib/notifications/notifications.functions";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { DigestSubscriptionsList, type DigestKey } from "@/components/admin/daily-digest/digest-subscriptions-list";

export const Route = createFileRoute("/_authenticated/admin/daily-digest")({ component: DailyDigestAdmin });

function DailyDigestAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listNotificationRecipients);
  const update = useServerFn(updateNotificationRecipient);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.notificationRecipients.list(),
    queryFn: () => list(),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string } & Partial<Record<DigestKey, boolean>>) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notificationRecipients.all }),
  });

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Daily Digest</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One combined email per subscriber, 7am PST, built from whichever categories they're subscribed to below.
          Add or remove people on the{" "}
          <Link to="/admin/notifications" className="underline">Notifications</Link> page.
        </p>
      </div>
      <DigestSubscriptionsList
        rows={rows}
        isLoading={isLoading}
        onUpdate={(id, patch) => updateMut.mutate({ id, ...patch })}
      />
    </div>
  );
}

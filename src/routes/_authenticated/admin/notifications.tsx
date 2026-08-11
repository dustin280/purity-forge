import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotificationRecipients, createNotificationRecipient,
  updateNotificationRecipient, deleteNotificationRecipient,
} from "@/lib/notifications/notifications.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { AddRecipientForm, type NewRecipient } from "@/components/admin/notifications/add-form";
import { RecipientsList } from "@/components/admin/notifications/recipients-list";

export const Route = createFileRoute("/_authenticated/admin/notifications")({ component: NotificationsAdmin });

function NotificationsAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listNotificationRecipients);
  const create = useServerFn(createNotificationRecipient);
  const update = useServerFn(updateNotificationRecipient);
  const del = useServerFn(deleteNotificationRecipient);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.notificationRecipients.list(),
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.notificationRecipients.all });

  const addMut = useMutation({
    mutationFn: (r: NewRecipient) => create({ data: {
      name: r.name, email: r.email || null, phone: r.phone || null,
      notify_email: r.notify_email, notify_sms: r.notify_sms,
    } }),
    onSuccess: () => { toast.success("Recipient added"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; notify_email?: boolean; notify_sms?: boolean; is_active?: boolean }) => update({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Recipient removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Who gets emailed/texted when a new Sample Receipt is submitted — one alert per intake batch, not per vial.
        </p>
      </div>

      <AddRecipientForm
        busy={addMut.isPending}
        onAdd={(r, reset) => addMut.mutate(r, { onSuccess: reset })}
      />
      <RecipientsList
        rows={rows}
        isLoading={isLoading}
        onUpdate={(id, patch) => updateMut.mutate({ id, ...patch })}
        onDelete={(id) => delMut.mutate(id)}
      />
    </div>
  );
}

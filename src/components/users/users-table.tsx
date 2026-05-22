import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, KeyRound, Pencil } from "lucide-react";
import { setUserRole, deleteUser } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { qk } from "@/lib/query-keys";
import { ROLES, type Role, type ProfileExt, displayName } from "./types";
import type { EditUserSeed } from "./edit-user-dialog";

type UsersData = {
  profiles: Array<{ id: string; email: string | null; full_name: string | null } & Partial<ProfileExt>>;
  roles: Array<{ user_id: string; role: string }>;
};

/**
 * Renders the user roster with role toggles and per-row actions (edit, reset
 * password, delete). Action triggers call back into the parent so the
 * corresponding dialog component owns its own state and server calls.
 */
export function UsersTable({
  data,
  isLoading,
  currentUserId,
  onEdit,
  onResetPassword,
}: {
  data: UsersData | undefined;
  isLoading: boolean;
  currentUserId: string | null;
  onEdit: (seed: EditUserSeed) => void;
  onResetPassword: (userId: string) => void;
}) {
  const qc = useQueryClient();
  const setFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteUser);

  async function toggle(userId: string, role: Role, grant: boolean) {
    try {
      await setFn({ data: { userId, role, grant } });
      toast.success(`${grant ? "Granted" : "Revoked"} ${role}`);
      qc.invalidateQueries({ queryKey: qk.users.list() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDelete(userId: string) {
    try {
      await deleteFn({ data: { userId } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: qk.users.list() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Card className="border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">User</th>
            {ROLES.map(r => <th key={r} className="text-center px-4 py-3 font-semibold">{r}</th>)}
            <th className="text-right px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
          {data?.profiles.map(p => {
            const px = p as ProfileExt;
            return (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{displayName(px)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.email}{px.title ? ` · ${px.title}` : ""}
                  </div>
                </td>
                {ROLES.map(r => {
                  const has = data.roles.some(x => x.user_id === p.id && x.role === r);
                  return (
                    <td key={r} className="text-center px-4 py-3">
                      <Switch checked={has} onCheckedChange={v => toggle(p.id, r, v)} />
                    </td>
                  );
                })}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" title="Edit user" onClick={() => onEdit({
                      userId: p.id,
                      first_name: px.first_name ?? "",
                      last_name: px.last_name ?? "",
                      email: p.email ?? "",
                      title: px.title ?? "",
                    })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onResetPassword(p.id)} title="Reset password">
                      <KeyRound className="size-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" disabled={p.id === currentUserId} title={p.id === currentUserId ? "You cannot delete yourself" : "Delete user"}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete user?</AlertDialogTitle>
                          <AlertDialogDescription>This permanently removes {p.email} and revokes all access. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(p.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listUsers } from "@/lib/lims.functions";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import { InviteUserDialog } from "@/components/users/invite-user-dialog";
import { AddUserDialog } from "@/components/users/add-user-dialog";
import { EditUserDialog, type EditUserSeed } from "@/components/users/edit-user-dialog";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { UsersTable } from "@/components/users/users-table";

export const Route = createFileRoute("/_authenticated/users")({ component: Users });

function Users() {
  const listFn = useServerFn(listUsers);
  const { data, isLoading } = useQuery({ queryKey: qk.users.list(), queryFn: () => listFn() });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ""));
  }, []);

  const [editSeed, setEditSeed] = useState<EditUserSeed | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Users & Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">Create accounts, assign roles, and remove users.</p>
        </div>
        <div className="flex gap-2">
          <InviteUserDialog />
          <AddUserDialog />
        </div>
      </div>

      <UsersTable
        data={data}
        isLoading={isLoading}
        currentUserId={currentUserId}
        onEdit={setEditSeed}
        onResetPassword={setResetUserId}
      />

      <ResetPasswordDialog userId={resetUserId} onClose={() => setResetUserId(null)} />
      <EditUserDialog seed={editSeed} onClose={() => setEditSeed(null)} />
    </div>
  );
}
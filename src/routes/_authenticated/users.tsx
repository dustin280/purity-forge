import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, setUserRole, createUser, deleteUser, resetUserPassword } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2, KeyRound, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/users")({ component: Users });

const ROLES = ["admin", "tech", "reviewer"] as const;
type Role = typeof ROLES[number];

type ProfileExt = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
};

function displayName(p: ProfileExt): string {
  const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fl || p.full_name || p.email || "Unknown";
}

function Users() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const setFn = useServerFn(setUserRole);
  const createFn = useServerFn(createUser);
  const deleteFn = useServerFn(deleteUser);
  const resetFn = useServerFn(resetUserPassword);
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => listFn() });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  if (currentUserId === null) {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ""));
  }

  // Add user dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    title: "",
    password: "",
    roles: ["tech"] as Role[],
  });
  const [busy, setBusy] = useState(false);

  // Reset password dialog state
  const [pwOpen, setPwOpen] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");

  async function toggle(userId: string, role: Role, grant: boolean) {
    try {
      await setFn({ data: { userId, role, grant } });
      toast.success(`${grant ? "Granted" : "Revoked"} ${role}`);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleAdd() {
    setBusy(true);
    try {
      await createFn({
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          title: form.title.trim() || null,
          password: form.password,
          roles: form.roles,
        },
      });
      toast.success("User created");
      setAddOpen(false);
      setForm({ first_name: "", last_name: "", email: "", title: "", password: "", roles: ["tech"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function handleDelete(userId: string) {
    try {
      await deleteFn({ data: { userId } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleReset() {
    if (!pwOpen) return;
    try {
      await resetFn({ data: { userId: pwOpen, password: pwValue } });
      toast.success("Password updated");
      setPwOpen(null); setPwValue("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Users & Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">Create accounts, assign roles, and remove users.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="size-4 mr-2" />Add user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>Creates an account with the chosen roles. The user can sign in immediately.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                <div><Label>Last name</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
              </div>
              <div><Label>Email address</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lab Technician" /></div>
              <div><Label>Temporary password</Label><Input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" /></div>
              <div>
                <Label>Roles</Label>
                <div className="flex gap-4 mt-2">
                  {ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2 text-sm capitalize">
                      <input type="checkbox" checked={form.roles.includes(r)}
                        onChange={e => setForm({ ...form, roles: e.target.checked ? [...form.roles, r] : form.roles.filter(x => x !== r) })} />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleAdd} disabled={busy || !form.email || !form.first_name.trim() || !form.last_name.trim() || form.password.length < 8}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
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
            {data?.profiles.map(p => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{displayName(p)}</div>
                  <div className="text-xs text-muted-foreground">{p.email}{(p as ProfileExt).title ? ` · ${(p as ProfileExt).title}` : ""}</div>
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
                    <Button size="sm" variant="ghost" onClick={() => { setPwOpen(p.id); setPwValue(""); }} title="Reset password">
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
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!pwOpen} onOpenChange={(o) => { if (!o) { setPwOpen(null); setPwValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for this user.</DialogDescription>
          </DialogHeader>
          <div><Label>New password</Label><Input type="text" value={pwValue} onChange={e => setPwValue(e.target.value)} placeholder="Min 8 characters" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwOpen(null); setPwValue(""); }}>Cancel</Button>
            <Button onClick={handleReset} disabled={pwValue.length < 8}>Update password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
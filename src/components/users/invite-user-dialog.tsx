import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { inviteUser } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { qk } from "@/lib/query-keys";
import type { Role } from "./types";
import { RoleCheckboxes } from "./role-checkboxes";

/** Sends an email invite; the user picks their own password on first sign-in. */
export function InviteUserDialog() {
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteUser);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", title: "",
    roles: ["tech"] as Role[],
  });

  async function handleInvite() {
    setBusy(true);
    try {
      await inviteFn({
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          title: form.title.trim() || null,
          roles: form.roles,
        },
      });
      toast.success(`Invitation sent to ${form.email}`);
      setOpen(false);
      setForm({ first_name: "", last_name: "", email: "", title: "", roles: ["tech"] });
      qc.invalidateQueries({ queryKey: qk.users.list() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Mail className="size-4 mr-2" />Invite user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>Sends an email invitation. The user sets their own password on first sign-in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div><Label>Email address</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lab Technician" /></div>
          <div>
            <Label>Roles</Label>
            <RoleCheckboxes value={form.roles} onChange={roles => setForm({ ...form, roles })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleInvite} disabled={busy || !form.email || !form.first_name.trim() || !form.last_name.trim()}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
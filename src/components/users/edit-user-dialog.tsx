import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateUserProfile } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { qk } from "@/lib/query-keys";

export type EditUserSeed = {
  userId: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
};

/**
 * Controlled edit-user dialog. The parent owns the seed (so it can open the
 * dialog from a row click); this component owns the form state + mutation.
 */
export function EditUserDialog({
  seed,
  onClose,
}: {
  seed: EditUserSeed | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editFn = useServerFn(updateUserProfile);
  const [form, setForm] = useState<EditUserSeed | null>(seed);
  const [busy, setBusy] = useState(false);

  // Sync local form when parent opens a different row.
  if (seed && (!form || form.userId !== seed.userId)) {
    setForm(seed);
  }
  if (!seed && form) {
    setForm(null);
  }

  async function handleSave() {
    if (!form) return;
    setBusy(true);
    try {
      await editFn({
        data: {
          userId: form.userId,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          title: form.title.trim() || null,
        },
      });
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: qk.users.list() });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!seed} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update the user's name, email, and title.</DialogDescription>
        </DialogHeader>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label>Last name</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
            </div>
            <div><Label>Email address</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lab Technician" /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || !form?.first_name.trim() || !form?.last_name.trim() || !form?.email.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
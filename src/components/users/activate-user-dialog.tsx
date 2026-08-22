import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { activateUser } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { qk } from "@/lib/query-keys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

/**
 * Activates a user whose invite was never accepted: confirms their email
 * address and sets a password so they can sign in immediately.
 */
export function ActivateUserDialog({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const activateFn = useServerFn(activateUser);
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) setPw("");
  }, [userId]);

  async function handleActivate() {
    if (!userId) return;
    setBusy(true);
    try {
      await activateFn({ data: { userId, password: pw } });
      toast.success("Account activated — the user can sign in now");
      qc.invalidateQueries({ queryKey: qk.users.list() });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate account</DialogTitle>
          <DialogDescription>
            This user's invite was never accepted, so sign-in fails with "Email not confirmed".
            Setting a password here confirms their email and lets them sign in right away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleActivate} disabled={pw.length < 8 || busy}>
            {busy ? "…" : "Activate account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

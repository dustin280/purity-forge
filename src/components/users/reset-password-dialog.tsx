import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { resetUserPassword } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

/**
 * Reset-password dialog. The parent decides which user is being reset (via
 * `userId`); this owns the password input and the server call.
 */
export function ResetPasswordDialog({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const resetFn = useServerFn(resetUserPassword);
  const [pw, setPw] = useState("");

  // Clear input whenever the dialog closes.
  useEffect(() => {
    if (!userId) setPw("");
  }, [userId]);

  async function handleReset() {
    if (!userId) return;
    try {
      await resetFn({ data: { userId, password: pw } });
      toast.success("Password updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for this user.</DialogDescription>
        </DialogHeader>
        <div><Label>New password</Label><Input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReset} disabled={pw.length < 8}>Update password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
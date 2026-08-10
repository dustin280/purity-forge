import { useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Tiny confirm-with-name dialog used to capture the reviewer/approver
 * identity before transitioning a preparation between draft/reviewed/approved.
 */
export function TransitionDialog({
  label, title, actionText, defaultName, loading, onConfirm, trigger,
}: {
  label: string;
  title: string;
  actionText: string;
  defaultName: string;
  loading: boolean;
  onConfirm: (name: string) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Confirm your name to {label.toLowerCase()} this preparation
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">{label} as</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={loading || !name.trim()} onClick={() => { onConfirm(name.trim()); setOpen(false); }}>
            {actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * QC approve/reject dialog for a controlled-material receipt. Owns its own
 * open/name/decision state so the parent route only deals with the final
 * mutation call.
 */
export function ApproveDialog({
  defaultName,
  onApprove,
  loading,
}: {
  defaultName: string;
  onApprove: (name: string, pass: boolean) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pass, setPass] = useState<"pass" | "fail">("pass");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><ShieldCheck className="size-4 mr-1" /> Approve / Release</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approval decision</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Approver name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Decision</Label>
            <Select value={pass} onValueChange={v => setPass(v as "pass" | "fail")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Pass — Release from quarantine</SelectItem>
                <SelectItem value="fail">Fail — Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={loading || !name.trim()}
            onClick={() => { onApprove(name.trim(), pass === "pass"); setOpen(false); }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
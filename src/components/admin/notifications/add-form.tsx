import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";

export type NewRecipient = {
  name: string; email: string; phone: string;
  notify_email: boolean; notify_sms: boolean;
};

/** Inline add form for a new notification recipient. Owns its own input state. */
export function AddRecipientForm({
  onAdd, busy,
}: {
  onAdd: (recipient: NewRecipient, reset: () => void) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(true);

  function reset() {
    setName(""); setEmail(""); setPhone(""); setNotifyEmail(true); setNotifySms(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (!email.trim() && !phone.trim()) return;
    onAdd({ name: n, email: email.trim(), phone: phone.trim(), notify_email: notifyEmail, notify_sms: notifySms }, reset);
  }

  return (
    <Card className="p-5 border-border mb-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="mt-1" placeholder="e.g. Sarah — Lab Manager" value={name}
              onChange={e => setName(e.target.value)} maxLength={128} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input className="mt-1" type="email" placeholder="sarah@synthesyx.com" value={email}
              onChange={e => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label className="text-xs">Phone (SMS)</Label>
            <Input className="mt-1" type="tel" placeholder="+15551234567" value={phone}
              onChange={e => setPhone(e.target.value)} maxLength={32} />
          </div>
        </div>
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={notifyEmail} onCheckedChange={(v) => setNotifyEmail(!!v)} /> Notify by email
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={notifySms} onCheckedChange={(v) => setNotifySms(!!v)} /> Notify by text
          </label>
          <Button type="submit" size="sm" disabled={busy || !name.trim() || (!email.trim() && !phone.trim())} className="ml-auto">
            <Plus className="size-4 mr-1" /> Add recipient
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Create / edit dialog for a Client. Manages the primary client fields plus
 * a dynamic list of up to 10 additional contacts.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { qk } from "@/lib/query-keys";
import {
  createClient, updateClient, getClient,
  type ClientContactRow,
} from "@/lib/clients.functions";

type ContactDraft = { id?: string; name: string; title: string; email: string; phone: string };

const emptyContact = (): ContactDraft => ({ name: "", title: "", email: "", phone: "" });

function emptyForm() {
  return {
    company_name: "", address: "",
    primary_contact_name: "", primary_contact_title: "",
    primary_contact_email: "", primary_contact_phone: "",
  };
}

export function ClientFormDialog({
  open, onOpenChange, clientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string | null;
}) {
  const qc = useQueryClient();
  const get = useServerFn(getClient);
  const create = useServerFn(createClient);
  const update = useServerFn(updateClient);

  const [form, setForm] = useState(emptyForm());
  const [contacts, setContacts] = useState<ContactDraft[]>([]);

  const { data: existing } = useQuery({
    queryKey: qk.clients.detail(clientId ?? ""),
    queryFn: () => get({ data: { id: clientId! } }),
    enabled: open && !!clientId,
  });

  useEffect(() => {
    if (!open) return;
    if (existing && clientId) {
      setForm({
        company_name: existing.company_name ?? "",
        address: existing.address ?? "",
        primary_contact_name: existing.primary_contact_name ?? "",
        primary_contact_title: existing.primary_contact_title ?? "",
        primary_contact_email: existing.primary_contact_email ?? "",
        primary_contact_phone: existing.primary_contact_phone ?? "",
      });
      setContacts((existing.contacts ?? []).map((c: ClientContactRow) => ({
        id: c.id, name: c.name ?? "", title: c.title ?? "",
        email: c.email ?? "", phone: c.phone ?? "",
      })));
    } else if (!clientId) {
      setForm(emptyForm());
      setContacts([]);
    }
  }, [open, clientId, existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: form.company_name.trim(),
        address: form.address.trim() || null,
        primary_contact_name: form.primary_contact_name.trim() || null,
        primary_contact_title: form.primary_contact_title.trim() || null,
        primary_contact_email: form.primary_contact_email.trim() || null,
        primary_contact_phone: form.primary_contact_phone.trim() || null,
        contacts: contacts
          .filter(c => c.name.trim() !== "")
          .map(c => ({
            name: c.name.trim(),
            title: c.title.trim() || null,
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
          })),
      };
      if (!payload.company_name) throw new Error("Company name is required");
      if (clientId) {
        await update({ data: { id: clientId, ...payload } });
      } else {
        await create({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(clientId ? "Client updated" : "Client added");
      qc.invalidateQueries({ queryKey: qk.clients.all });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  function updateContact(idx: number, patch: Partial<ContactDraft>) {
    setContacts(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientId ? "Edit Client" : "Add Client"}</DialogTitle>
          <DialogDescription className="sr-only">
            {clientId ? "Edit an existing client record" : "Add a new client record"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="grid gap-4 py-2"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="cn" className="text-xs">Company Name<span className="text-destructive ml-0.5">*</span></Label>
              <Input id="cn" value={form.company_name} required
                onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="addr" className="text-xs">Address</Label>
              <Textarea id="addr" rows={2} value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pcn" className="text-xs">Primary Contact Name</Label>
              <Input id="pcn" value={form.primary_contact_name}
                onChange={(e) => setForm(f => ({ ...f, primary_contact_name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pct" className="text-xs">Primary Contact Title</Label>
              <Input id="pct" value={form.primary_contact_title}
                onChange={(e) => setForm(f => ({ ...f, primary_contact_title: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pce" className="text-xs">Primary Contact Email</Label>
              <Input id="pce" type="email" value={form.primary_contact_email}
                onChange={(e) => setForm(f => ({ ...f, primary_contact_email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pcp" className="text-xs">Primary Contact Phone</Label>
              <Input id="pcp" type="tel" value={form.primary_contact_phone}
                onChange={(e) => setForm(f => ({ ...f, primary_contact_phone: e.target.value }))} />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">Additional Contacts</div>
                <div className="text-xs text-muted-foreground">Up to 10 contacts ({contacts.length}/10)</div>
              </div>
              <Button type="button" variant="outline" size="sm"
                disabled={contacts.length >= 10}
                onClick={() => setContacts(prev => [...prev, emptyContact()])}>
                <Plus className="size-4 mr-1" /> Add Contact
              </Button>
            </div>
            <div className="space-y-3">
              {contacts.map((c, idx) => (
                <div key={idx} className="grid sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end border rounded-md p-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                    <Input value={c.name} onChange={(e) => updateContact(idx, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</Label>
                    <Input value={c.title} onChange={(e) => updateContact(idx, { title: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</Label>
                    <Input type="email" value={c.email} onChange={(e) => updateContact(idx, { email: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</Label>
                    <Input type="tel" value={c.phone} onChange={(e) => updateContact(idx, { phone: e.target.value })} />
                  </div>
                  <Button type="button" variant="ghost" size="icon"
                    onClick={() => setContacts(prev => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {contacts.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No additional contacts.</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : clientId ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
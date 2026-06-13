/**
 * Clients directory page. Searchable list of clients with Add/Edit and a
 * card per client showing primary contact and additional-contact count.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import { listClients, deleteClient } from "@/lib/clients.functions";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

function ClientsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const del = useServerFn(deleteClient);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: qk.clients.list(search),
    queryFn: () => list({ data: { search: search || undefined } }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Client deleted");
      qc.invalidateQueries({ queryKey: qk.clients.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  function openNew() { setEditingId(null); setOpen(true); }
  function openEdit(id: string) { setEditingId(id); setOpen(true); }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Directory</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage clients used by the Sample Receipt form.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-1" /> Add Client
        </Button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by company, contact, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="text-sm text-muted-foreground italic border rounded-md p-8 text-center">
          {search ? "No clients match your search." : "No clients yet. Click Add Client to create one."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.company_name}</div>
                    {c.address && (
                      <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{c.address}</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(c.id)}>
                      <Pencil className="size-3.5 mr-1" /> Update
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (confirm(`Delete ${c.company_name}?`)) deleteMut.mutate(c.id); }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {(c.primary_contact_name || c.primary_contact_email || c.primary_contact_phone) && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-0.5">
                    {c.primary_contact_name && (
                      <div className="font-medium">
                        {c.primary_contact_name}
                        {c.primary_contact_title && <span className="text-muted-foreground"> · {c.primary_contact_title}</span>}
                      </div>
                    )}
                    {c.primary_contact_email && <div className="text-muted-foreground">{c.primary_contact_email}</div>}
                    {c.primary_contact_phone && <div className="text-muted-foreground">{c.primary_contact_phone}</div>}
                  </div>
                )}
                <div className="mt-3">
                  <Badge variant="secondary" className="text-[10px]">
                    <ClientContactsCount clientId={c.id} />
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ClientFormDialog open={open} onOpenChange={setOpen} clientId={editingId} />
    </div>
  );
}

// Tiny inline label that just shows "n contacts" by fetching from the cached detail
// query when available, otherwise a generic label.
function ClientContactsCount({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<{ contacts?: unknown[] }>(qk.clients.detail(clientId));
  const n = cached?.contacts?.length;
  if (typeof n === "number") return <>{n} additional contact{n === 1 ? "" : "s"}</>;
  return <>View contacts</>;
}
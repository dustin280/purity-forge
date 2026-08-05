/**
 * Searchable client picker for the New Sample form. Selects an existing
 * `clients` row (samples.client_id must reference one — see
 * supabase/migrations/20260805120200_add_samples_client_id.sql) or creates a
 * new client inline via the existing `createClient` server function.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listClients, createClient as createClientFn } from "@/lib/clients.functions";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";

export function ClientSelect({
  clientId,
  clientName,
  onSelect,
}: {
  clientId: string;
  clientName: string;
  onSelect: (id: string, name: string) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const createClient = useServerFn(createClientFn);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: qk.clients.list(search),
    queryFn: () => list({ data: { search: search || undefined } }),
    enabled: focused,
  });

  const exactMatch = clients.some(c => c.company_name.toLowerCase() === search.trim().toLowerCase());

  async function handleCreate() {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    try {
      const client = await createClient({ data: { company_name: name } });
      toast.success(`Added client "${client.company_name}"`);
      qc.invalidateQueries({ queryKey: qk.clients.all });
      onSelect(client.id, client.company_name);
      setSearch("");
      setFocused(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create client");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="client">Client</Label>
      {clientId ? (
        <Badge variant="secondary" className="gap-1 text-sm py-1.5 px-3">
          {clientName}
          <button type="button" onClick={() => onSelect("", "")} className="hover:text-destructive" aria-label="Change client">
            <X className="size-3" />
          </button>
        </Badge>
      ) : (
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="client"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className="pl-9"
          />
          {focused && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
              {clients.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onSelect(c.id, c.company_name); setSearch(""); setFocused(false); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  {c.company_name}
                </button>
              ))}
              {search.trim() && !exactMatch && (
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={e => { e.preventDefault(); void handleCreate(); }}
                  className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t border-border"
                >
                  {creating ? "Adding…" : `+ Add new client "${search.trim()}"`}
                </button>
              )}
              {clients.length === 0 && !search.trim() && (
                <div className="p-3 text-xs text-muted-foreground">Type to search clients.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

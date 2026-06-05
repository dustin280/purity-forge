/**
 * Compact client picker for the CoC form: searchable dropdown of active
 * clients plus a "register new client" checkbox.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listClients, type ClientRow } from "@/lib/clients.functions";
import { qk } from "@/lib/query-keys";

export function ClientPicker({
  selectedCompany,
  onPick,
  registerNewClient,
  onToggleRegister,
}: {
  selectedCompany: string;
  onPick: (client: ClientRow) => void;
  registerNewClient: boolean;
  onToggleRegister: (v: boolean) => void;
}) {
  const list = useServerFn(listClients);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: qk.clients.list(search),
    queryFn: () => list({ data: { search: search || undefined } }),
  });

  return (
    <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold">Client</Label>
        {selectedCompany && (
          <Badge variant="secondary" className="gap-1">
            {selectedCompany}
            <button
              type="button"
              onClick={() => onPick({
                id: "", company_name: "", address: null,
                primary_contact_name: null, primary_contact_title: null,
                primary_contact_email: null, primary_contact_phone: null,
                is_active: true, created_by: null, created_at: "", updated_at: "",
              })}
              className="hover:text-destructive"
              aria-label="Clear client fields"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search clients by company, contact, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className="pl-9 h-9 bg-background"
          disabled={registerNewClient}
        />
        {focused && !registerNewClient && (
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
            {clients.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No matching clients.</div>
            ) : clients.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(c); setSearch(""); setFocused(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
              >
                <div className="font-medium">{c.company_name}</div>
                {c.primary_contact_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {c.primary_contact_name}
                    {c.primary_contact_email && ` · ${c.primary_contact_email}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
        <Checkbox
          checked={registerNewClient}
          onCheckedChange={(v) => onToggleRegister(Boolean(v))}
        />
        <span>
          <span className="font-medium">New client</span>
          <span className="text-muted-foreground"> — add the info below to the Clients directory on submit.</span>
        </span>
      </label>
    </div>
  );
}
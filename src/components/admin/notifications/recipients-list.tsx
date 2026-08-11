import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";

type Row = {
  id: string; name: string; email: string | null; phone: string | null;
  notify_email: boolean; notify_sms: boolean; is_active: boolean;
};

/**
 * Filterable list of notification recipients with per-row channel toggles,
 * active toggle, and delete. Filter input state is owned locally;
 * mutations are delegated.
 */
export function RecipientsList({
  rows, isLoading, onUpdate, onDelete,
}: {
  rows: Row[];
  isLoading: boolean;
  onUpdate: (id: string, patch: Partial<Pick<Row, "notify_email" | "notify_sms" | "is_active">>) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = rows.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <Input
          placeholder={`Filter ${rows.length} recipients…`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-8"
        />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No recipients match.</div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-[180px]">
                <div className={`text-sm font-medium truncate ${r.is_active ? "" : "text-muted-foreground line-through"}`}>
                  {r.name}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[r.email, r.phone].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Email
                <Switch checked={r.notify_email} disabled={!r.email}
                  onCheckedChange={(v) => onUpdate(r.id, { notify_email: v })} />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Text
                <Switch checked={r.notify_sms} disabled={!r.phone}
                  onCheckedChange={(v) => onUpdate(r.id, { notify_sms: v })} />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {r.is_active ? "Active" : "Inactive"}
                <Switch checked={r.is_active} onCheckedChange={(v) => onUpdate(r.id, { is_active: v })} />
              </label>
              <Button
                size="icon" variant="ghost"
                onClick={() => {
                  if (confirm(`Remove "${r.name}" from notifications? This cannot be undone.`)) onDelete(r.id);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

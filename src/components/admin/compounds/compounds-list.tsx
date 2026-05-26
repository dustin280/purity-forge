import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Check, X } from "lucide-react";

type Row = { id: string; name: string; is_active: boolean };

export function CompoundsList({
  rows,
  isLoading,
  onToggleActive,
  onRename,
  onDelete,
}: {
  rows: Row[];
  isLoading: boolean;
  onToggleActive: (id: string, is_active: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()),
  );

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft(r.name);
  }
  function commit() {
    if (editingId && draft.trim()) {
      onRename(editingId, draft.trim());
    }
    setEditingId(null);
  }

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <Input
          placeholder={`Filter ${rows.length} compounds…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8"
        />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No compounds match.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                {editingId === c.id ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={160}
                      className="h-8"
                    />
                    <Button size="icon" variant="ghost" onClick={commit}>
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`text-sm font-medium truncate ${
                      c.is_active
                        ? ""
                        : "text-muted-foreground line-through"
                    }`}
                  >
                    {c.name}
                  </div>
                )}
              </div>
              {editingId !== c.id && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{c.is_active ? "Active" : "Inactive"}</span>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(v) => onToggleActive(c.id, v)}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(c)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${c.name}"? This cannot be undone.`,
                        )
                      )
                        onDelete(c.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { type Compound } from "@/lib/compounds.functions";
import { CompoundDetailPanel } from "./compound-detail-panel";

export function CompoundsList({
  rows,
  isLoading,
  onToggleActive,
  onRename,
  onDelete,
  onPatch,
}: {
  rows: Compound[];
  isLoading: boolean;
  onToggleActive: (id: string, is_active: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, patch: Partial<Compound>) => void;
}) {
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()),
  );

  function startEdit(r: Compound) {
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
          {filtered.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Button
                    size="icon" variant="ghost" className="size-6 shrink-0"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                  >
                    {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </Button>
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
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate cursor-pointer ${c.is_active ? "" : "text-muted-foreground line-through"}`}
                          onClick={() => setExpandedId(expanded ? null : c.id)}
                        >
                          {c.name}
                        </span>
                        {c.is_blend && <Badge variant="secondary" className="text-[10px]">Blend</Badge>}
                        {!c.is_blend && c.acquisition_method && <Badge variant="outline" className="text-[10px] font-mono">{c.acquisition_method}</Badge>}
                      </div>
                    )}
                  </div>
                  {editingId !== c.id && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{c.is_active ? "Active" : "Inactive"}</span>
                        <Switch checked={c.is_active} onCheckedChange={(v) => onToggleActive(c.id, v)} />
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(c)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => { if (confirm(`Delete "${c.name}"? This cannot be undone.`)) onDelete(c.id); }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
                {expanded && (
                  <div className="mt-2 ml-9">
                    <CompoundDetailPanel
                      compound={c}
                      allCompounds={rows}
                      onPatch={(patch) => onPatch(c.id, patch)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

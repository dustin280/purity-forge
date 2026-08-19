import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { TEST_TYPE_OPTIONS, type NonPurityTestType } from "./test-type-options";

// The DB column reuses the full test_type enum (including "purity"), but no
// admin should ever route a flag to purity — every sample already gets a
// purity test automatically. Widened here only so the raw Row type from the
// server matches; the dropdown itself never offers "purity" as a choice.
type Row = { id: string; name: string; is_active: boolean; maps_to_test_type: NonPurityTestType | "purity" | null };

/**
 * Filterable list of test parameters with per-row active toggle and
 * delete. Filter input state is owned locally; mutations are delegated.
 */
export function ParametersList({
  rows, isLoading, onToggleActive, onDelete, onChangeTestType,
}: {
  rows: Row[];
  isLoading: boolean;
  onToggleActive: (id: string, is_active: boolean) => void;
  onDelete: (id: string) => void;
  onChangeTestType: (id: string, mapsToTestType: NonPurityTestType | null) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = rows.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <Input
          placeholder={`Filter ${rows.length} parameters…`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-8"
        />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No parameters match.</div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map(p => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${p.is_active ? "" : "text-muted-foreground line-through"}`}>
                  {p.name}
                </div>
              </div>
              <Select
                value={p.maps_to_test_type ?? "none"}
                onValueChange={(v) => onChangeTestType(p.id, v === "none" ? null : v as NonPurityTestType)}
              >
                <SelectTrigger className="w-48 h-8 text-xs" title="Which test this flag provisions at Sample Receipt">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Doesn't auto-provision</SelectItem>
                  {TEST_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>Routes to: {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{p.is_active ? "Active" : "Inactive"}</span>
                <Switch
                  checked={p.is_active}
                  onCheckedChange={(v) => onToggleActive(p.id, v)}
                />
              </div>
              <Button
                size="icon" variant="ghost"
                onClick={() => {
                  if (confirm(`Delete "${p.name}"? This cannot be undone.`)) onDelete(p.id);
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
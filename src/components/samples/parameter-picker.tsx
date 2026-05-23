import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

type Param = { id: string; name: string };

/**
 * Compact multi-select used on the New Sample form. Shows selected
 * parameters as removable chips, a filter input, and a scrollable
 * checkbox list. Admin users see a link to manage the master list.
 */
export function ParameterPicker({
  params, selected, onToggle, isAdmin,
}: {
  params: Param[];
  selected: string[];
  onToggle: (name: string) => void;
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState("");
  const filtered = params.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Test Parameters{" "}
          {selected.length > 0 && (
            <span className="text-muted-foreground font-normal">({selected.length} selected)</span>
          )}
        </Label>
        {isAdmin && (
          <Link to="/admin/parameters" className="text-xs text-muted-foreground hover:text-foreground underline">
            Manage list
          </Link>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(name => (
            <Badge key={name} variant="secondary" className="gap-1">
              {name}
              <button type="button" onClick={() => onToggle(name)} className="hover:text-destructive">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        placeholder={`Filter ${params.length} parameters…`}
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="h-8"
      />
      <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No parameters available.</div>
        ) : filtered.map(p => {
          const checked = selected.includes(p.name);
          return (
            <label key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(p.name)} />
              <span>{p.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
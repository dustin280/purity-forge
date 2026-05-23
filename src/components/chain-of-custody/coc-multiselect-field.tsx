import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

/**
 * Multi-select chip+filter+checkbox-list used for the CoC "requested tests"
 * style fields. Kept dumb: parent owns the selected array.
 */
export function MultiselectField({ fieldKey, selected, options, onToggle }: {
  fieldKey: string;
  selected: string[];
  options: { id: string; name: string }[];
  onToggle: (name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = options.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  return (
    <div className="space-y-2" key={fieldKey}>
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
        placeholder={`Filter ${options.length} parameters…`}
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="h-8"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
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
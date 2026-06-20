import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, FlaskConical, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listLibraryItems } from "@/lib/library.functions";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-select for compound names that pulls from the user's Library catalog
 * and also accepts a pasted list. Returns a flat string[] of unique names.
 */
export function CompoundMultiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [paste, setPaste] = useState("");
  const list = useServerFn(listLibraryItems);

  const itemsQuery = useQuery({
    queryKey: ["library_items", "compound-picker"],
    queryFn: () => list({ data: undefined as never }),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = itemsQuery.data ?? [];
    if (!needle) return items.slice(0, 200);
    return items.filter((i) =>
      (i.names ?? "").toLowerCase().includes(needle) ||
      (i.cas_number ?? "").toLowerCase().includes(needle),
    ).slice(0, 200);
  }, [itemsQuery.data, search]);

  const toggle = (name: string) => {
    const set = new Set(value);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange(Array.from(set));
  };

  const addPasted = () => {
    const parts = paste
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const set = new Set(value);
    for (const p of parts) set.add(p);
    onChange(Array.from(set));
    setPaste("");
  };

  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" type="button" className="h-8 justify-start font-normal w-full">
            <FlaskConical className="size-3 mr-1.5" />
            {value.length === 0 ? (
              <span className="text-muted-foreground">Select compounds…</span>
            ) : (
              <span className="truncate">{value.length} selected</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-2 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Library by name or CAS…"
              className="h-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {itemsQuery.isLoading && (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" /> Loading library…
              </div>
            )}
            {itemsQuery.data && filtered.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No matches.</div>
            )}
            {filtered.map((item) => {
              const checked = value.includes(item.names);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.names)}
                  className="w-full text-left px-2 py-1.5 hover:bg-muted/50 flex items-center gap-2 text-sm"
                >
                  <span className={`size-4 rounded border grid place-items-center shrink-0 ${checked ? "bg-primary border-primary text-primary-foreground" : ""}`}>
                    {checked && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{item.names}</span>
                  {item.cas_number && (
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{item.cas_number}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="p-2 border-t space-y-2">
            <div className="text-[11px] text-muted-foreground">Or paste a list (comma / newline separated)</div>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="caffeine, theobromine, theophylline"
              className="min-h-[60px] text-xs"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={addPasted} disabled={!paste.trim()}>
                Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
              {name}
              <button type="button" onClick={() => remove(name)} className="hover:text-destructive" aria-label={`Remove ${name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
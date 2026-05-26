import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface CompoundOption {
  id: string;
  name: string;
}

interface CompoundPickerProps {
  options: CompoundOption[];
  value: { parameter_id: string | null; name: string };
  onChange: (next: { parameter_id: string | null; name: string }) => void;
  onCreateCompound?: (name: string) => Promise<CompoundOption>;
  disabled?: boolean;
}

export function CompoundPicker({
  options,
  value,
  onChange,
  onCreateCompound,
  disabled,
}: CompoundPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const trimmed = search.trim();
  const hasExact = options.some(
    (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = !!onCreateCompound && trimmed.length > 0 && !hasExact;

  async function handleCreate() {
    if (!onCreateCompound || !trimmed || creating) return;
    try {
      setCreating(true);
      const created = await onCreateCompound(trimmed);
      onChange({ parameter_id: created.id, name: created.name });
      setSearch("");
      setOpen(false);
    } catch {
      /* mutation onError already toasts */
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value.name && "text-muted-foreground",
          )}
        >
          {value.name || "Select compound…"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align="start">
        <Command>
          <CommandInput
            placeholder="Search or add compound…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm flex items-center"
                >
                  <Plus className="mr-2 size-4" />
                  {creating ? "Adding…" : `Add "${trimmed}"`}
                </button>
              ) : (
                "No compounds found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => {
                    onChange({ parameter_id: o.id, name: o.name });
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value.parameter_id === o.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {o.name}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`__create_${trimmed}`}
                  onSelect={handleCreate}
                  disabled={creating}
                >
                  <Plus className="mr-2 size-4" />
                  {creating ? "Adding…" : `Add "${trimmed}"`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
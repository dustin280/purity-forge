import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listSolventOptions, addSolventOption, listModifierOptions, addModifierOption } from "@/lib/standard-preparations.functions";

interface Props {
  value: string;
  onChange: (name: string) => void;
  kind: "solvent" | "modifier";
  placeholder?: string;
}

const ADD_NEW = "__add_new__";

export function OptionPicker({ value, onChange, kind, placeholder }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(kind === "solvent" ? listSolventOptions : listModifierOptions);
  const addFn = useServerFn(kind === "solvent" ? addSolventOption : addModifierOption);
  const queryKey = [kind === "solvent" ? "solvent-options" : "modifier-options"];

  type Opt = { id: string; name: string };
  const { data: options = [] } = useQuery({
    queryKey,
    queryFn: () => listFn() as Promise<Opt[]>,
  });
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const addMut = useMutation({
    mutationFn: (name: string) => addFn({ data: { name } }) as Promise<Opt>,
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey });
      onChange(row.name);
      setOpen(false);
      setNewName("");
      toast.success(`Added ${row.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Select
        value={value || undefined}
        onValueChange={v => {
          if (v === ADD_NEW) { setOpen(true); return; }
          onChange(v);
        }}
      >
        <SelectTrigger><SelectValue placeholder={placeholder ?? "Select…"} /></SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
          ))}
          <SelectItem value={ADD_NEW}>+ Add new…</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {kind === "solvent" ? "Solvent" : "Modifier"}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={kind === "solvent" ? "e.g. Hexane" : "e.g. NH4OH"}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || addMut.isPending}
              onClick={() => addMut.mutate(newName.trim())}
            >
              {addMut.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

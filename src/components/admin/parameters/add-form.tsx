import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

/** Inline add form for a new test parameter. Owns its own input state. */
export function AddParameterForm({
  onAdd, busy,
}: {
  onAdd: (name: string, reset: () => void) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, () => setName(""));
  }
  return (
    <Card className="p-5 border-border mb-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          placeholder="New test name (e.g. Endotoxin)"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={128}
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </form>
    </Card>
  );
}
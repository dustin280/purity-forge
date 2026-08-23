import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";

/** Inline add form for a new compound (single or blend). Owns its own input state. */
export function AddCompoundForm({
  onAdd,
  busy,
}: {
  onAdd: (name: string, isBlend: boolean, reset: () => void) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [isBlend, setIsBlend] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, isBlend, () => { setName(""); setIsBlend(false); });
  }
  return (
    <Card className="p-5 border-border mb-4">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="New compound or blend name (e.g. BPC-157, SUMMIT)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={160}
          className="flex-1 min-w-56"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <Checkbox checked={isBlend} onCheckedChange={(v) => setIsBlend(v === true)} />
          Multi-compound blend
        </label>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </form>
    </Card>
  );
}
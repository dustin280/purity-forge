import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { TEST_TYPE_OPTIONS, type NonPurityTestType } from "./test-type-options";

/** Inline add form for a new test parameter. Owns its own input state. */
export function AddParameterForm({
  onAdd, busy,
}: {
  onAdd: (name: string, mapsToTestType: NonPurityTestType | null, reset: () => void) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [mapsTo, setMapsTo] = useState<NonPurityTestType | "none">("none");
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, mapsTo === "none" ? null : mapsTo, () => { setName(""); setMapsTo("none"); });
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
        <Select value={mapsTo} onValueChange={v => setMapsTo(v as NonPurityTestType | "none")}>
          <SelectTrigger className="w-56" title="Which test this flag provisions at Sample Receipt — leave as 'Doesn't auto-provision' for compound-name entries">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Doesn't auto-provision</SelectItem>
            {TEST_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>Routes to: {t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </form>
    </Card>
  );
}
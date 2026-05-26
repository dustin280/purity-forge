import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  useMobilePhaseReagents,
  useMobilePhaseReagentMutations,
} from "@/components/mobile-phase/use-mobile-phase";

export const Route = createFileRoute("/_authenticated/admin/mobile-phase-reagents")({
  component: MobilePhaseReagentsAdmin,
});

type Kind = "solvent" | "modifier" | "diluent";
const KINDS: Kind[] = ["solvent", "modifier", "diluent"];

function MobilePhaseReagentsAdmin() {
  const { role } = useAuth();
  const { data: rows = [], isLoading } = useMobilePhaseReagents();
  const { createMut, updateMut, deleteMut } = useMobilePhaseReagentMutations();
  const [name, setName] = useState("");
  const [kinds, setKinds] = useState<Kind[]>(["solvent"]);

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  function toggleKind(k: Kind) {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function add() {
    if (!name.trim() || kinds.length === 0) return;
    createMut.mutate(
      { name: name.trim(), kinds, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 },
      { onSuccess: () => { setName(""); setKinds(["solvent"]); } },
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Mobile Phase Reagents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solvents, modifiers, and diluents available in the Mobile Phase Prep Log dropdowns. A reagent can have multiple kinds.
        </p>
      </div>

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acetonitrile (ACN)" />
          </div>
          <div className="space-y-1">
            <Label>Kinds</Label>
            <div className="flex flex-wrap gap-3 py-2">
              {KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox checked={kinds.includes(k)} onCheckedChange={() => toggleKind(k)} />
                  {k}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={add} disabled={createMut.isPending || !name.trim() || kinds.length === 0}>
            Add reagent
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kinds</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No reagents.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.kinds.map((k) => <Badge key={k} variant="secondary" className="capitalize">{k}</Badge>)}
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => updateMut.mutate({ id: r.id, is_active: v })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon" variant="ghost"
                    disabled={deleteMut.isPending}
                    onClick={() => { if (confirm(`Delete ${r.name}?`)) deleteMut.mutate(r.id); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
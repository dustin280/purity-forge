import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { listParameters, createParameter, updateParameter, deleteParameter } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/parameters")({ component: ParametersAdmin });

function ParametersAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listParameters);
  const create = useServerFn(createParameter);
  const update = useServerFn(updateParameter);
  const del = useServerFn(deleteParameter);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["test_parameters"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["test_parameters"] });

  const addMut = useMutation({
    mutationFn: (name: string) => create({ data: { name } }),
    onSuccess: () => { toast.success("Parameter added"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; name?: string; is_active?: boolean }) => update({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Parameter removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    addMut.mutate(n, { onSuccess: () => setNewName("") });
  }

  const filtered = rows.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()));

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Test Parameters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compounds available for selection during sample intake. Deactivate to hide from intake without losing history.
        </p>
      </div>

      <Card className="p-5 border-border mb-4">
        <form onSubmit={onAdd} className="flex gap-2">
          <Input
            placeholder="New parameter name (e.g. BPC-157)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={128}
          />
          <Button type="submit" disabled={addMut.isPending || !newName.trim()}>
            <Plus className="size-4 mr-1" /> Add
          </Button>
        </form>
      </Card>

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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{p.is_active ? "Active" : "Inactive"}</span>
                  <Switch
                    checked={p.is_active}
                    onCheckedChange={(v) => updateMut.mutate({ id: p.id, is_active: v })}
                  />
                </div>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This cannot be undone.`)) delMut.mutate(p.id);
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
    </div>
  );
}
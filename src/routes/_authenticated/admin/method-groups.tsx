import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { listMethodGroups, upsertMethodGroup, deleteMethodGroup, type MethodGroup } from "@/lib/method-groups.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/method-groups")({
  component: MethodGroupsAdmin,
});

function MethodGroupsAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listMethodGroups);
  const upsert = useServerFn(upsertMethodGroup);
  const del = useServerFn(deleteMethodGroup);
  const { data } = useQuery({ queryKey: qk.methodGroups.list(), queryFn: () => list() });

  const [name, setName] = useState("");
  const [temp, setTemp] = useState("40");
  const [prio, setPrio] = useState("5");
  const [method, setMethod] = useState("");
  const [proc, setProc] = useState("");

  const upsertMut = useMutation({
    mutationFn: (v: Parameters<typeof upsert>[0]["data"]) => upsert({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.methodGroups.all }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.methodGroups.all }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") return <div className="p-6 text-sm text-muted-foreground">Admin only.</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Method Groups</h1>
        <p className="text-sm text-muted-foreground mt-1">Priority classes used by the Run List Generator. Lower priority = runs first.</p>
      </div>

      <Card className="p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            upsertMut.mutate({
              name: name.trim(),
              temperature_c: Number(temp),
              priority: Number(prio),
              default_acquisition_method: method.trim() || null,
              default_processing_method: proc.trim() || null,
              description: null,
              is_active: true,
            }, {
              onSuccess: () => { setName(""); setMethod(""); setProc(""); },
            });
          }}
          className="grid sm:grid-cols-[1fr_100px_100px_1fr_1fr_auto] gap-3 items-end"
        >
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></div>
          <div><Label className="text-xs">Temp °C</Label><Input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} /></div>
          <div><Label className="text-xs">Priority</Label><Input type="number" step="1" value={prio} onChange={(e) => setPrio(e.target.value)} /></div>
          <div><Label className="text-xs">Acq. method (.amx)</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Optional" /></div>
          <div><Label className="text-xs">Proc. method</Label><Input value={proc} onChange={(e) => setProc(e.target.value)} placeholder="Optional" /></div>
          <Button type="submit" disabled={upsertMut.isPending}><Plus className="size-4 mr-1" />Add</Button>
        </form>
      </Card>

      <Card className="divide-y divide-border">
        {(data ?? []).map((g) => (
          <MethodGroupRow key={g.id} g={g} onSave={(patch) => upsertMut.mutate({ id: g.id, ...patch })} onDelete={() => delMut.mutate(g.id)} />
        ))}
        {(data ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No method groups yet.</div>}
      </Card>
    </div>
  );
}

function MethodGroupRow({
  g, onSave, onDelete,
}: {
  g: MethodGroup;
  onSave: (patch: {
    name: string; temperature_c: number; priority: number;
    default_acquisition_method: string | null; default_processing_method: string | null;
    description: string | null; is_active: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [temp, setTemp] = useState(String(g.temperature_c));
  const [prio, setPrio] = useState(String(g.priority));
  const [method, setMethod] = useState(g.default_acquisition_method ?? "");
  const [proc, setProc] = useState(g.default_processing_method ?? "");
  return (
    <div className="p-3 grid sm:grid-cols-[1fr_100px_100px_1fr_1fr_auto_auto] gap-3 items-center">
      <div className="font-medium">{g.name}</div>
      <Input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} onBlur={() => onSave({ name: g.name, temperature_c: Number(temp), priority: Number(prio), default_acquisition_method: method || null, default_processing_method: proc || null, description: g.description, is_active: g.is_active })} />
      <Input type="number" step="1" value={prio} onChange={(e) => setPrio(e.target.value)} onBlur={() => onSave({ name: g.name, temperature_c: Number(temp), priority: Number(prio), default_acquisition_method: method || null, default_processing_method: proc || null, description: g.description, is_active: g.is_active })} />
      <Input value={method} onChange={(e) => setMethod(e.target.value)} onBlur={() => onSave({ name: g.name, temperature_c: Number(temp), priority: Number(prio), default_acquisition_method: method || null, default_processing_method: proc || null, description: g.description, is_active: g.is_active })} placeholder="Acq. method" />
      <Input value={proc} onChange={(e) => setProc(e.target.value)} onBlur={() => onSave({ name: g.name, temperature_c: Number(temp), priority: Number(prio), default_acquisition_method: method || null, default_processing_method: proc || null, description: g.description, is_active: g.is_active })} placeholder="Proc. method" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{g.is_active ? "Active" : "Off"}</span>
        <Switch checked={g.is_active} onCheckedChange={(v) => onSave({ name: g.name, temperature_c: g.temperature_c, priority: g.priority, default_acquisition_method: g.default_acquisition_method, default_processing_method: g.default_processing_method, description: g.description, is_active: v })} />
      </div>
      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${g.name}"?`)) onDelete(); }}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
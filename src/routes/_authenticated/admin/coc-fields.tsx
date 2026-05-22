import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
import { qk } from "@/lib/query-keys";
  listCocFields, createCocField, updateCocField, deleteCocField,
} from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/coc-fields")({ component: CocFieldsAdmin });

type FieldType = "text" | "textarea" | "number" | "date" | "datetime" | "email" | "tel" | "multiselect";
type CocField = {
  id: string; field_key: string; label: string; field_type: FieldType;
  is_required: boolean; is_active: boolean; sort_order: number; placeholder: string | null;
};

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "multiselect", label: "Multi-select" },
];

function CocFieldsAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listCocFields);
  const create = useServerFn(createCocField);
  const update = useServerFn(updateCocField);
  const del = useServerFn(deleteCocField);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.cocFields.list(),
    queryFn: () => list() as Promise<CocField[]>,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.cocFields.list() });
    qc.invalidateQueries({ queryKey: qk.cocRecords.list() });
  };

  const addMut = useMutation({
    mutationFn: (v: { field_key: string; label: string; field_type: FieldType; is_required: boolean }) =>
      create({ data: v }),
    onSuccess: () => { toast.success("Field added"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; label?: string; field_type?: FieldType; is_required?: boolean; is_active?: boolean; sort_order?: number }) =>
      update({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Field removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newRequired, setNewRequired] = useState(false);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = newLabel.trim();
    if (!key || !label) { toast.error("Key and label are required"); return; }
    addMut.mutate(
      { field_key: key, label, field_type: newType, is_required: newRequired },
      { onSuccess: () => { setNewKey(""); setNewLabel(""); setNewType("text"); setNewRequired(false); } }
    );
  }

  function move(idx: number, dir: -1 | 1) {
    const target = rows[idx + dir];
    const me = rows[idx];
    if (!target || !me) return;
    updateMut.mutate({ id: me.id, sort_order: target.sort_order });
    updateMut.mutate({ id: target.id, sort_order: me.sort_order });
  }

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Chain of Custody Fields</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define the fields shown on the Chain of Custody intake form. Deactivate to hide without losing history.
        </p>
      </div>

      <Card className="p-5 border-border mb-4">
        <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Field key</Label>
            <Input className="mt-1" placeholder="e.g. courier_name" value={newKey}
              onChange={e => setNewKey(e.target.value)} maxLength={64} />
            <div className="text-[10px] text-muted-foreground mt-1">Lowercase, no spaces. Used as the storage key.</div>
          </div>
          <div>
            <Label className="text-xs">Label</Label>
            <Input className="mt-1" placeholder="e.g. Courier Name" value={newLabel}
              onChange={e => setNewLabel(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Switch id="new-req" checked={newRequired} onCheckedChange={setNewRequired} />
              <Label htmlFor="new-req" className="text-xs">Required</Label>
            </div>
            <Button type="submit" disabled={addMut.isPending}>
              <Plus className="size-4 mr-1" /> Add field
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No fields configured.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((f, idx) => (
              <li key={f.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-2.5">
                <div className="flex flex-col">
                  <Button size="icon" variant="ghost" className="size-6"
                    disabled={idx === 0} onClick={() => move(idx, -1)}>
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-6"
                    disabled={idx === rows.length - 1} onClick={() => move(idx, 1)}>
                    <ArrowDown className="size-3" />
                  </Button>
                </div>
                <div className="min-w-0">
                  <Input
                    defaultValue={f.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== f.label) updateMut.mutate({ id: f.id, label: v });
                    }}
                    className={`h-8 ${f.is_active ? "" : "text-muted-foreground line-through"}`}
                  />
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{f.field_key}</div>
                </div>
                <Select value={f.field_type} onValueChange={(v) => updateMut.mutate({ id: f.id, field_type: v as FieldType })}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={f.is_required}
                    onCheckedChange={(v) => updateMut.mutate({ id: f.id, is_required: v })} />
                  <span>Req</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={f.is_active}
                    onCheckedChange={(v) => updateMut.mutate({ id: f.id, is_active: v })} />
                  <span>Active</span>
                </div>
                <Button size="icon" variant="ghost"
                  onClick={() => { if (confirm(`Delete field "${f.label}"? Existing data is preserved but the field will disappear.`)) delMut.mutate(f.id); }}
                  className="text-muted-foreground hover:text-destructive">
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
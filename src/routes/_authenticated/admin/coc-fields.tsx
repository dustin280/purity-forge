import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listCocFields, createCocField, updateCocField, deleteCocField,
} from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { AddFieldForm } from "@/components/admin/coc-fields/add-field-form";
import { FieldRow } from "@/components/admin/coc-fields/field-row";
import type { CocField, FieldType } from "@/components/admin/coc-fields/types";

export const Route = createFileRoute("/_authenticated/admin/coc-fields")({ component: CocFieldsAdmin });

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

  function handleAdd(payload: { field_key: string; label: string; field_type: FieldType; is_required: boolean }) {
    addMut.mutate(payload);
  }

  function move(idx: number, dir: -1 | 1) {
    const target = rows[idx + dir];
    const me = rows[idx];
    if (!target || !me) return;
    updateMut.mutate({ id: me.id, sort_order: target.sort_order });
    updateMut.mutate({ id: target.id, sort_order: me.sort_order });
  }

  function handleUpdate(id: string, patch: Partial<CocField>) {
    updateMut.mutate({ id, ...patch });
  }

  function handleDelete(id: string, label: string) {
    if (confirm(`Delete field "${label}"? Existing data is preserved but the field will disappear.`)) {
      delMut.mutate(id);
    }
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

      <AddFieldForm onAdd={handleAdd} adding={addMut.isPending} />

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No fields configured.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((f, idx) => (
              <FieldRow
                key={f.id}
                f={f}
                idx={idx}
                total={rows.length}
                onMove={move}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
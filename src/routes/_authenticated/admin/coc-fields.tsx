import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { AddFieldForm } from "@/components/admin/coc-fields/add-field-form";
import { FieldRow } from "@/components/admin/coc-fields/field-row";
import { useCocFields } from "@/components/admin/coc-fields/use-coc-fields";

export const Route = createFileRoute("/_authenticated/admin/coc-fields")({ component: CocFieldsAdmin });

function CocFieldsAdmin() {
  const { role } = useAuth();
  const { rows, isLoading, adding, handleAdd, move, handleUpdate, handleDelete } = useCocFields();

  if (role && role !== "admin") {
    return <div className="p-8 text-sm text-muted-foreground">Admin role required.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Chain of Custody Fields</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define the fields shown on the Chain of Custody intake form. Deactivate to hide without losing history.
        </p>
      </div>

      <AddFieldForm onAdd={handleAdd} adding={adding} />

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
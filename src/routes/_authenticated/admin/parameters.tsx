import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listParameters, createParameter, updateParameter, deleteParameter } from "@/lib/lims.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { AddParameterForm } from "@/components/admin/parameters/add-form";
import { ParametersList } from "@/components/admin/parameters/parameters-list";
export const Route = createFileRoute("/_authenticated/admin/parameters")({ component: ParametersAdmin });

function ParametersAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listParameters);
  const create = useServerFn(createParameter);
  const update = useServerFn(updateParameter);
  const del = useServerFn(deleteParameter);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.testParameters.list(),
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.testParameters.list() });

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
        <h1 className="text-3xl font-bold tracking-tight mt-1">Requested Tests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tests available for selection on each compound row of the Chain of Custody (e.g. Endotoxin, Heavy Metals, Sterility). Deactivate to hide without losing history.
        </p>
      </div>

      <AddParameterForm
        busy={addMut.isPending}
        onAdd={(name, reset) => addMut.mutate(name, { onSuccess: reset })}
      />
      <ParametersList
        rows={rows}
        isLoading={isLoading}
        onToggleActive={(id, is_active) => updateMut.mutate({ id, is_active })}
        onDelete={(id) => delMut.mutate(id)}
      />
    </div>
  );
}
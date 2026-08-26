import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import {
  listCompounds,
  createCompound,
  updateCompound,
  deleteCompound,
  type Compound,
} from "@/lib/compounds.functions";
import { AddCompoundForm } from "@/components/admin/compounds/add-form";
import { CompoundsList } from "@/components/admin/compounds/compounds-list";

export const Route = createFileRoute("/_authenticated/admin/compounds")({
  component: CompoundsAdmin,
});

function CompoundsAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listCompounds);
  const create = useServerFn(createCompound);
  const update = useServerFn(updateCompound);
  const del = useServerFn(deleteCompound);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.compounds.list(),
    queryFn: () => list(),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.compounds.all });

  const addMut = useMutation({
    mutationFn: (v: { name: string; is_blend: boolean }) => create({ data: v }),
    onSuccess: () => {
      toast.success("Compound added");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string } & Partial<Compound>) => update({ data: v }),
    onSuccess: invalidate,
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Compound removed");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  if (role && role !== "admin") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Admin role required.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-3" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Administration
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Compounds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every compound (and blend) carries its own acquisition/processing method, column
          temperature, wavelength, injection volume, diluent, calibration levels, and separate
          Standard Prep / Sample Prep modification notes — click a row to configure it. Blends
          reference their component compounds directly, each with its own per-level target,
          instead of a free-text recipe.
        </p>
      </div>

      <AddCompoundForm
        busy={addMut.isPending}
        onAdd={(name, isBlend, reset) => addMut.mutate({ name, is_blend: isBlend }, { onSuccess: reset })}
      />
      <CompoundsList
        rows={rows}
        isLoading={isLoading}
        onToggleActive={(id, is_active) => updateMut.mutate({ id, is_active })}
        onRename={(id, name) => updateMut.mutate({ id, name })}
        onDelete={(id) => delMut.mutate(id)}
        onPatch={(id, patch) => updateMut.mutate({ id, ...patch })}
      />
    </div>
  );
}

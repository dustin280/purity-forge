import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScoutingForm } from "@/components/parameter-scouting/scouting-form";
import { EntriesTable } from "@/components/parameter-scouting/entries-table";
import { useParameterScouting } from "@/components/parameter-scouting/use-parameter-scouting";
import type { ParameterScoutingRow } from "@/lib/parameter-scouting.functions";

export const Route = createFileRoute(
  "/_authenticated/lab-logs/parameter-scouting/",
)({ component: ParameterScoutingPage });

function ParameterScoutingPage() {
  const { profile, role, user } = useAuth();
  const defaultName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";
  const {
    query,
    compoundsQuery,
    createCompoundMut,
    createMut,
    updateMut,
    deleteMut,
  } = useParameterScouting();
  const { data: rows = [], isLoading } = query;
  const [editing, setEditing] = useState<ParameterScoutingRow | null>(null);

  const compoundOptions = useMemo(
    () =>
      (compoundsQuery.data ?? [])
        .filter((p) => p.is_active)
        .map((p) => ({ id: p.id, name: p.name })),
    [compoundsQuery.data],
  );

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Logs
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          Parameter Scouting Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture HPLC method scouting conditions and the compound run list.
        </p>
      </div>

      {canCreate && (
        <ScoutingForm
          defaultUserName={defaultName}
          compoundOptions={compoundOptions}
          onCreateCompound={(name) =>
            createCompoundMut
              .mutateAsync(name)
              .then((c) => ({ id: c.id, name: c.name }))
          }
          editing={editing}
          loading={createMut.isPending || updateMut.isPending}
          onSubmit={(payload) => {
            if (editing) {
              updateMut.mutate(
                { id: editing.id, ...payload },
                { onSuccess: () => setEditing(null) },
              );
            } else {
              createMut.mutate(payload);
            }
          }}
          onCancelEdit={() => setEditing(null)}
        />
      )}

      <EntriesTable
        rows={rows}
        isLoading={isLoading}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
        deleteLoading={deleteMut.isPending}
        onEdit={(r) => {
          setEditing(r);
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  createBackpressureLog,
  deleteBackpressureLog,
  listBackpressureLogs,
} from "@/lib/daily-backpressure.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/query-keys";
import { ReadingForm } from "@/components/daily-backpressure/reading-form";
import { ReadingsTable } from "@/components/daily-backpressure/readings-table";

export const Route = createFileRoute("/_authenticated/lab-logs/daily-backpressure/")({
  component: BackpressureLog,
});

function BackpressureLog() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const defaultName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";

  const list = useServerFn(listBackpressureLogs);
  const create = useServerFn(createBackpressureLog);
  const del = useServerFn(deleteBackpressureLog);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.backpressure.list(),
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (payload: {
      reading_at: string;
      user_name: string;
      instrument: string;
      backpressure: number;
      backpressure_unit: string;
      notes: string | null;
    }) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Reading logged");
      qc.invalidateQueries({ queryKey: qk.backpressure.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.backpressure.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          Daily Backpressure Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick daily readings from the HPLC system.
        </p>
      </div>

      {canCreate && (
        <ReadingForm
          defaultUserName={defaultName}
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
        />
      )}

      <ReadingsTable
        rows={rows}
        isLoading={isLoading}
        isAdmin={isAdmin}
        deleteLoading={deleteMut.isPending}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  );
}

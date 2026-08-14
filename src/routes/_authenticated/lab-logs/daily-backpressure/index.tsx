import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ReadingForm } from "@/components/daily-backpressure/reading-form";
import { ReadingsTable } from "@/components/daily-backpressure/readings-table";
import { useBackpressure } from "@/components/daily-backpressure/use-backpressure";
import { BackpressureTrendChart } from "@/components/daily-backpressure/trend-chart";
import { runPressureWatcherNow } from "@/lib/lab-logs/pressure-watcher.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/daily-backpressure/")({
  component: BackpressureLog,
});

function BackpressureLog() {
  const { profile, role } = useAuth();
  const defaultName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const canCreate = role === "admin" || role === "tech" || role === "reviewer";
  const isAdmin = role === "admin";
  const { query, createMut, deleteMut } = useBackpressure();
  const { data: rows = [], isLoading } = query;

  const qc = useQueryClient();
  const runWatcher = useServerFn(runPressureWatcherNow);
  const runWatcherMut = useMutation({
    mutationFn: () => runWatcher(),
    onSuccess: (result) => {
      toast.success(
        `Watcher scanned ${result.foldersScanned} folder${result.foldersScanned === 1 ? "" : "s"}: ` +
          `${result.imported} imported, ${result.skipped} already up to date` +
          (result.errors.length ? `, ${result.errors.length} error(s)` : ""),
      );
      if (result.errors.length) console.warn("Pressure watcher errors:", result.errors);
      qc.invalidateQueries({ queryKey: qk.backpressure.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Logs
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Daily Backpressure Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quick daily readings from the HPLC system.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={runWatcherMut.isPending}
            onClick={() => runWatcherMut.mutate()}
          >
            <RefreshCw className={`size-4 mr-1.5 ${runWatcherMut.isPending ? "animate-spin" : ""}`} />
            {runWatcherMut.isPending ? "Running…" : "Run watcher now"}
          </Button>
        )}
      </div>

      <div className="mb-6">
        <BackpressureTrendChart rows={rows} isLoading={isLoading} />
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

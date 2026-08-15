import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QcTrendChart } from "@/components/cal-qc-trend/qc-trend-chart";
import { listCalQcPeakLog, listUnmatchedCalQcCompounds, getRtReferenceBand } from "@/lib/lab-logs/cal-qc.functions";
import { runCalQcWatcherNow, reassignCalQcCompound } from "@/lib/lab-logs/cal-qc-watcher.functions";
import { listCompounds } from "@/lib/compounds.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/cal-qc-trend/")({
  component: CalQcTrendPage,
});

function CalQcTrendPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const listPeaks = useServerFn(listCalQcPeakLog);
  const listUnmatched = useServerFn(listUnmatchedCalQcCompounds);
  const listComp = useServerFn(listCompounds);
  const getBand = useServerFn(getRtReferenceBand);
  const runWatcher = useServerFn(runCalQcWatcherNow);
  const reassign = useServerFn(reassignCalQcCompound);

  const { data: rows = [], isLoading } = useQuery({ queryKey: qk.calQcPeakLog.list(), queryFn: () => listPeaks() });
  const { data: unmatched = [] } = useQuery({ queryKey: qk.calQcPeakLog.unmatched(), queryFn: () => listUnmatched() });
  const { data: compounds = [] } = useQuery({ queryKey: qk.compounds.list(), queryFn: () => listComp() });

  const compoundOptions = useMemo(() => {
    const idsWithData = new Set(rows.map((r) => r.compound_id).filter((id): id is string => id != null));
    return compounds.filter((c) => idsWithData.has(c.id));
  }, [rows, compounds]);

  const [selectedCompoundId, setSelectedCompoundId] = useState<string | null>(null);
  const effectiveCompoundId = selectedCompoundId ?? compoundOptions[0]?.id ?? null;

  const { data: rtBand } = useQuery({
    queryKey: effectiveCompoundId ? qk.calQcPeakLog.rtBand(effectiveCompoundId) : ["cal-qc-peak-log", "rt-band", "none"],
    queryFn: () => getBand({ data: { compoundId: effectiveCompoundId as string } }),
    enabled: !!effectiveCompoundId,
  });

  const compoundRows = useMemo(
    () => (effectiveCompoundId ? rows.filter((r) => r.compound_id === effectiveCompoundId) : []),
    [rows, effectiveCompoundId],
  );

  const runWatcherMut = useMutation({
    mutationFn: () => runWatcher(),
    onSuccess: (result) => {
      toast.success(
        `Imported ${result.imported} peak(s); ${result.skippedNotIntegrated} not yet integrated in OpenLab; ` +
          `${result.skippedNoResultFile} missing a result file; ${result.skippedOtherSampleType} not Cal Std/QC` +
          (result.errors.length ? `; ${result.errors.length} error(s)` : ""),
      );
      if (result.errors.length) console.warn("Cal/QC watcher errors:", result.errors);
      qc.invalidateQueries({ queryKey: qk.calQcPeakLog.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassignMut = useMutation({
    mutationFn: (d: { raw_compound_name: string; compound_id: string }) => reassign({ data: d }),
    onSuccess: () => {
      toast.success("Reassigned");
      qc.invalidateQueries({ queryKey: qk.calQcPeakLog.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Cal/QC Peak Trend Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Retention time and peak area per compound from Cal Std and QC Check injections, over time.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" disabled={runWatcherMut.isPending} onClick={() => runWatcherMut.mutate()}>
            <RefreshCw className={`size-4 mr-1.5 ${runWatcherMut.isPending ? "animate-spin" : ""}`} />
            {runWatcherMut.isPending ? "Running…" : "Run watcher now"}
          </Button>
        )}
      </div>

      <div className="mb-4 max-w-xs">
        <Select value={effectiveCompoundId ?? undefined} onValueChange={setSelectedCompoundId}>
          <SelectTrigger>
            <SelectValue placeholder={compoundOptions.length ? "Select a compound…" : "No tracked compounds yet"} />
          </SelectTrigger>
          <SelectContent>
            {compoundOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {effectiveCompoundId ? (
        <QcTrendChart rows={compoundRows} isLoading={isLoading} rtBand={rtBand} />
      ) : (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No Cal Std / QC data yet. Once the Cal Std and QC Samples Drive folders are configured in Sample Prep →
            Settings, run the watcher to start building this dataset.
          </CardContent>
        </Card>
      )}

      {unmatched.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Unmatched compounds ({unmatched.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Peaks whose compound name in the instrument data didn't match anything in the compound registry.
              Reassigning here fixes every historical row with that name at once.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw compound name</TableHead>
                  <TableHead className="w-[80px] text-right">Rows</TableHead>
                  <TableHead className="w-[280px]">Assign to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatched.map((u) => (
                  <TableRow key={u.raw_compound_name}>
                    <TableCell className="font-mono text-sm">{u.raw_compound_name}</TableCell>
                    <TableCell className="text-right">{u.count}</TableCell>
                    <TableCell>
                      <Select
                        onValueChange={(compoundId) =>
                          reassignMut.mutate({ raw_compound_name: u.raw_compound_name, compound_id: compoundId })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a compound…" />
                        </SelectTrigger>
                        <SelectContent>
                          {compounds.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Calibration / QC peak monitor.
 *
 * Deliberately organised by (compound × acquisition method) rather than by
 * compound: peak metrics from different acquisition methods are not
 * comparable, and a page that merged them would show a confident trend built
 * from unrelated runs. Each card is one method's evidence and nothing else.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FlaskConical } from "lucide-react";
import {
  getCalQcMonitor, HEIGHT_FLOOR_MAU, HEIGHT_CEILING_MAU,
  type CalQcMonitorResult,
} from "@/lib/lab-logs/cal-qc-monitor.functions";

export const Route = createFileRoute("/_authenticated/lab-logs/cal-qc-monitor")({
  component: CalQcMonitorPage,
  head: () => ({
    meta: [
      { title: "Cal / QC Peak Monitor · Lab Manager" },
      { name: "description", content: "Calibration and QC peak trends, grouped by acquisition method." },
    ],
  }),
});

const fmt = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));

function CalQcMonitorPage() {
  const getMonitor = useServerFn(getCalQcMonitor);
  const { data, isLoading } = useQuery<CalQcMonitorResult>({
    queryKey: ["cal-qc-monitor"],
    queryFn: () => getMonitor(),
  });

  const groups = data?.groups ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Cal / QC Peak Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Peak height, area and response factor per calibration level, so a curve can be checked
          against what the instrument actually did.
        </p>
      </div>

      {/* The whole reason this page is shaped the way it is. */}
      <Card className="p-3 border-amber-500/40 bg-amber-500/5">
        <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Every card below is one compound under one acquisition method.</span>{" "}
            Peak metrics are not comparable across acquisition methods, so nothing here is pooled between
            them — a compound run under three methods appears as three separate cards, and that is correct
            rather than duplication.
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Card className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Readings</div>
          <div className="text-xl font-semibold">{data?.totalReadings ?? 0}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acquisition methods</div>
          <div className="text-xl font-semibold">{data?.acqMethodCount ?? 0}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Groups</div>
          <div className="text-xl font-semibold">{groups.length}</div>
        </Card>
        {(data?.readingsWithoutMethod ?? 0) > 0 && (
          <Card className="px-4 py-3 border-amber-500/40">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">No method recorded</div>
            <div className="text-xl font-semibold text-amber-600">{data?.readingsWithoutMethod}</div>
          </Card>
        )}
      </div>

      {isLoading && <Card className="p-8 text-center text-muted-foreground">Loading…</Card>}

      {!isLoading && groups.length === 0 && (
        <Card className="p-8 text-center space-y-2">
          <FlaskConical className="size-6 mx-auto text-muted-foreground" />
          <div className="text-sm font-medium">No calibration readings yet</div>
          <p className="text-xs text-muted-foreground max-w-xl mx-auto">
            The Cal/QC watcher is paused while acquisition and processing methods are being finalised.
            Importing before then would fill this log with runs that cannot be compared with each other.
            Once the methods are settled, re-enable the hourly job and readings will appear here grouped
            by method.
          </p>
        </Card>
      )}

      {groups.map((g, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
            <div className="font-medium">{g.compoundName}</div>
            <Badge variant={g.acqMethodName ? "secondary" : "destructive"} className="text-[10px]">
              {g.acqMethodName ?? "no acquisition method"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{g.sampleType}</Badge>
            {g.processingMethodNames.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] text-muted-foreground">proc: {p}</Badge>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              {g.readings} reading{g.readings === 1 ? "" : "s"}
              {g.lastReadingAt && ` · latest ${new Date(g.lastReadingAt).toLocaleDateString()}`}
            </span>
          </div>

          {g.flags.length > 0 && (
            <div className="px-4 py-2 bg-amber-500/5 border-b border-border space-y-1">
              {g.flags.map((f, j) => (
                <div key={j} className="text-[11px] text-amber-700 dark:text-amber-300">{f}</div>
              ))}
            </div>
          )}

          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Level (mg/mL)</th>
                <th className="text-left px-4 py-2">Height (mAU)</th>
                <th className="text-left px-4 py-2">Area</th>
                <th className="text-left px-4 py-2">Resp. factor</th>
                <th className="text-left px-4 py-2">Symmetry</th>
                <th className="text-left px-4 py-2">n</th>
                <th className="text-left px-4 py-2">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {g.levels.map((l, j) => {
                const out = l.meanHeight != null
                  && (l.meanHeight < HEIGHT_FLOOR_MAU || l.meanHeight > HEIGHT_CEILING_MAU);
                return (
                  <tr key={j} className={out ? "bg-destructive/5" : undefined}>
                    <td className="px-4 py-2 font-mono">{l.calibrationAmount ?? "—"}</td>
                    <td className={`px-4 py-2 tabular-nums ${out ? "text-destructive font-medium" : ""}`}>
                      {fmt(l.meanHeight, 0)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmt(l.meanArea, 0)}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmt(l.meanResponseFactor, 0)}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmt(l.meanSymmetry, 2)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{l.readings}</td>
                    {/* The specific reason, not just a red row -- "62 mAU is
                        under the 100 mAU floor" is actionable; a colour is not. */}
                    <td className="px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                      {l.flags.length ? l.flags.join("; ") : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
            Usable window {HEIGHT_FLOOR_MAU}–{HEIGHT_CEILING_MAU} mAU
            {g.storedCalMin != null && ` · stored range ${g.storedCalMin}–${g.storedCalMax} mg/mL`}
            {g.rfRsdPct != null && ` · response factor spread ${g.rfRsdPct.toFixed(1)}%`}
          </div>
        </Card>
      ))}
    </div>
  );
}

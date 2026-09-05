import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InstrumentSolvents } from "@/lib/instrument-feed.functions";
import { getSolventAlertSettings } from "@/lib/instrument-solvents.functions";
import { qk } from "@/lib/query-keys";

/**
 * Solvent bottle levels for the selected instrument, straight from the pump's
 * bottle counters (which the stack keeps in step with the LS-1 level
 * sensor): A1 / A2 / B1 / B2 as fill bars, the waste counter, and which
 * bottles are under the low-solvent threshold.
 */
export function SolventLevelsCard({
  instrumentId,
  solvents,
  agentVersion,
}: {
  instrumentId: string | null;
  solvents: InstrumentSolvents | null | undefined;
  agentVersion: string | null | undefined;
}) {
  const settingsFn = useServerFn(getSolventAlertSettings);
  const { data: settings } = useQuery({
    queryKey: qk.solventAlerts.settings(instrumentId),
    queryFn: () => settingsFn({ data: { instrument_id: instrumentId ?? "" } }),
    enabled: !!instrumentId,
    refetchInterval: 30_000,
  });
  const threshold = settings?.threshold_pct ?? 20;
  const openAlerts = new Set(
    (settings?.alerts ?? []).filter((a) => !a.cleared_at).map((a) => a.bottle_key),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="size-4" /> Solvent bottles
          </CardTitle>
          <div className="text-[11px] text-muted-foreground">
            {solvents?.seen_at
              ? `as of ${new Date(solvents.seen_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : ""}
            {solvents ? ` · alert below ${threshold}%` : ""}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!solvents ? (
          <div className="text-sm text-muted-foreground">
            No bottle levels yet. They arrive with agent 1.5.0 or newer
            {agentVersion ? ` (this instrument's agent is ${agentVersion})` : ""}.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {solvents.bottles.map((b) => {
              const pct = b.pct ?? 0;
              const low = b.configured && (openAlerts.has(b.key) || pct < threshold);
              const width = Math.max(0, Math.min(100, pct));
              return (
                <div
                  key={b.key}
                  className={
                    "rounded-md border p-3 space-y-2 " +
                    (low ? "border-destructive/60 bg-destructive/5" : "border-border")
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{b.name}</div>
                    {b.configured ? (
                      low ? (
                        <Badge variant="destructive">Low</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">no bottle</span>
                    )}
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    {b.configured && (
                      <div
                        className={
                          "h-full rounded-full " +
                          (low
                            ? "bg-destructive"
                            : "bg-[var(--status-success,oklch(0.65_0.15_150))]")
                        }
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {b.configured
                      ? `${(b.remaining_ml ?? 0).toFixed(0)} mL of ${(b.capacity_ml ?? 0).toFixed(0)} mL`
                      : "not configured on the pump"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {solvents?.waste_ml != null && (
          <div className="mt-3 text-xs text-muted-foreground">
            Waste counter {solvents.waste_ml.toFixed(1)} mL
          </div>
        )}
      </CardContent>
    </Card>
  );
}

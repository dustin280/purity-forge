import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listInstrumentLiveOverview } from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";
import { LiveStateBadge, liveStateOf } from "@/components/live-instruments/instrument-status-list";

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)} min`;
}

export function LiveInstrumentsCard() {
  const fn = useServerFn(listInstrumentLiveOverview);
  const { data = [], isLoading } = useQuery({
    queryKey: qk.instrumentFeed.overview(),
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Instruments · Live</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/lab-logs/live-instruments">
              <ExternalLink className="size-4" /> Open feed
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active instruments.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.map((item) => {
              const state = liveStateOf(item);
              const pressure = item.status?.latest?.["PMP1B_Pressure"];
              return (
                <div key={item.instrument.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{item.instrument.name}</div>
                    <LiveStateBadge state={state} />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <div>
                      Pressure:{" "}
                      <span className="text-foreground tabular-nums">
                        {pressure && state !== "offline"
                          ? `${pressure.v.toFixed(1)} ${pressure.units}`
                          : "—"}
                      </span>
                    </div>
                    {item.status?.column_info?.description && (
                      <div className="truncate">
                        Column:{" "}
                        <span className="text-foreground">
                          {item.status.column_info.description}
                        </span>
                      </div>
                    )}
                    <div>
                      {state === "running" && item.current_run
                        ? `Injection #${item.current_run.injection_index} · ${ago(item.current_run.started_at)} in`
                        : state === "idle"
                          ? "Idle"
                          : item.status?.last_batch_at
                            ? `Last seen ${ago(item.status.last_batch_at)} ago`
                            : "No agent data yet"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

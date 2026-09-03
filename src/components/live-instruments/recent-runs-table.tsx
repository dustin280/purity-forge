import { Link } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InstrumentRunRow, InstrumentSequenceRow } from "@/lib/instrument-feed.functions";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function num(v: number | null | undefined, decimals = 1): string {
  return v === null || v === undefined ? "—" : v.toFixed(decimals);
}

export function RecentRunsTable({
  runs,
  sequences,
  isLoading,
}: {
  runs: InstrumentRunRow[];
  sequences: InstrumentSequenceRow[];
  isLoading?: boolean;
}) {
  const seqById = new Map(sequences.map((s) => [s.id, s]));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recent runs</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {isLoading ? (
          <div className="px-6 py-4 text-sm text-muted-foreground">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="px-6 py-4 text-sm text-muted-foreground">
            No runs recorded from the live feed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Inj #</TableHead>
                  <TableHead>Sequence</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Start bar</TableHead>
                  <TableHead className="text-right">Min / max bar</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const seq = r.sequence_id ? seqById.get(r.sequence_id) : undefined;
                  const s = r.summary;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmtDateTime(r.started_at)}
                      </TableCell>
                      <TableCell>{r.injection_index}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {seq ? `${fmtDateTime(seq.started_at)} · ${seq.injections_count} inj` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDuration(r.duration_s)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(s?.initiation?.pressure_bar)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(s?.pressure_min_bar)} / {num(s?.pressure_max_bar)}
                      </TableCell>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell className="text-right">
                        {r.trace_path ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/lab-logs/live-instruments/$runId" params={{ runId: r.id }}>
                              <PlayCircle className="size-4 mr-1" /> Replay
                            </Link>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

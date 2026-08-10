import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listInstrumentInventory } from "@/lib/instruments-inventory.functions";
import { qk } from "@/lib/query-keys";
import { useOpenLabSequence, useOpenLabSequences } from "./use-openlab";

export function SequencesTable() {
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const listInstruments = useServerFn(listInstrumentInventory);
  const { data: instruments } = useQuery({
    queryKey: qk.instrumentInventory.list(false),
    queryFn: () => listInstruments({ data: {} }),
  });
  const { data, isLoading } = useOpenLabSequences(instrumentFilter === "all" ? null : instrumentFilter);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useOpenLabSequence(selected);

  const instrumentName = useMemo(() => {
    const byId = new Map((instruments ?? []).map((i) => [i.id, i.instrument_name || [i.make, i.model].filter(Boolean).join(" ") || "Unnamed instrument"]));
    return (id: string | null) => (id ? byId.get(id) ?? "Unknown instrument" : "Shared project");
  }, [instruments]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Sequences</CardTitle>
        {(instruments?.length ?? 0) > 1 && (
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All instruments</SelectItem>
              {(instruments ?? []).map((i) => (
                <SelectItem key={i.id} value={i.id}>{instrumentName(i.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Lines</TableHead>
              <TableHead className="hidden md:table-cell">Instrument</TableHead>
              <TableHead className="hidden md:table-cell">Last modified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  No sequences cached. Upload sequence CSVs and run Sync.
                </TableCell>
              </TableRow>
            ) : (
              data.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(s.name)}
                >
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{s.line_count}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    <Badge variant="outline">{instrumentName(s.instrument_id)}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {s.last_modified
                      ? new Date(s.last_modified).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selected}</DialogTitle>
            <DialogDescription className="sr-only">
              OpenLab CDS sequence details
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : detail.data?.sequence ? (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground font-mono break-all">
                {detail.data.sequence.relative_path}
              </div>
              {detail.data.headers.length ? (
                <div className="overflow-auto max-h-[60vh] border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {detail.data.headers.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data.rows.map((r, ri) => (
                        <TableRow key={ri}>
                          {detail.data.headers.map((_, ci) => (
                            <TableCell key={ci} className="whitespace-nowrap">
                              {r[ci] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Badge variant="secondary">No CSV preview available</Badge>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
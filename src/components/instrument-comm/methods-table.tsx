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
import { useOpenLabMethod, useOpenLabMethods } from "./use-openlab";

function formatSize(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MethodsTable() {
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const listInstruments = useServerFn(listInstrumentInventory);
  const { data: instruments } = useQuery({
    queryKey: qk.instrumentInventory.list(false),
    queryFn: () => listInstruments({ data: {} }),
  });
  const { data, isLoading } = useOpenLabMethods(instrumentFilter === "all" ? null : instrumentFilter);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useOpenLabMethod(selected);

  const instrumentName = useMemo(() => {
    const byId = new Map((instruments ?? []).map((i) => [i.id, i.instrument_name || [i.make, i.model].filter(Boolean).join(" ") || "Unnamed instrument"]));
    return (id: string | null) => (id ? byId.get(id) ?? "Unknown instrument" : "Shared project");
  }, [instruments]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Acquisition Methods</CardTitle>
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
              <TableHead className="hidden sm:table-cell">Description</TableHead>
              <TableHead className="hidden md:table-cell">Instrument</TableHead>
              <TableHead className="hidden md:table-cell">Last modified</TableHead>
              <TableHead className="hidden md:table-cell">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  No methods cached. Upload methods to the storage bucket and run Sync.
                </TableCell>
              </TableRow>
            ) : (
              data.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(m.name)}
                >
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {m.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    <Badge variant="outline">{instrumentName(m.instrument_id)}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {m.last_modified
                      ? new Date(m.last_modified).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatSize(m.size_bytes)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected}</DialogTitle>
            <DialogDescription className="sr-only">
              OpenLab CDS acquisition method details
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : detail.data?.method ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Path</div>
                  <div className="font-mono break-all">
                    {detail.data.method.relative_path}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last modified</div>
                  <div>
                    {detail.data.method.last_modified
                      ? new Date(detail.data.method.last_modified).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Size</div>
                  <div>{formatSize(detail.data.method.size_bytes)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Synced</div>
                  <div>{new Date(detail.data.method.synced_at).toLocaleString()}</div>
                </div>
              </div>
              {detail.data.preview ? (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Preview</div>
                  <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-80 whitespace-pre-wrap">
                    {detail.data.preview}
                  </pre>
                </div>
              ) : (
                <Badge variant="secondary">No text preview available</Badge>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
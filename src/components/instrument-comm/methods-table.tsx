import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useOpenLabMethod, useOpenLabMethods } from "./use-openlab";

function formatSize(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MethodsTable() {
  const { data, isLoading } = useOpenLabMethods();
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useOpenLabMethod(selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acquisition Methods</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Description</TableHead>
              <TableHead className="hidden md:table-cell">Last modified</TableHead>
              <TableHead className="hidden md:table-cell">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow>
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
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
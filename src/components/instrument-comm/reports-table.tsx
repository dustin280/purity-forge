import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOpenLabReports } from "./use-openlab";

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportsTable() {
  const { data, isLoading } = useOpenLabReports();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Size</TableHead>
              <TableHead className="hidden md:table-cell">Last modified</TableHead>
              <TableHead className="hidden lg:table-cell">Path</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow>
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  No reports cached. Configure a Reports folder and Pull from Drive.
                </TableCell>
              </TableRow>
            ) : (
              data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatSize(r.size_bytes)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {r.last_modified
                      ? new Date(r.last_modified).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground font-mono text-xs break-all">
                    {r.relative_path}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
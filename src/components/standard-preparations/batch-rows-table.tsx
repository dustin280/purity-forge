import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABEL } from "@/lib/lims-utils";

export type BatchRow = {
  id: string;
  syn_id: string | null;
  log_number: string;
  standard_name: string;
  target_concentration: string | null;
  final_volume: string | null;
  expiration_date: string | null;
  status: string;
};

export function BatchRowsTable({ rows }: { rows: BatchRow[] }) {
  return (
    <Card className="p-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SYN ID</TableHead>
            <TableHead>Log #</TableHead>
            <TableHead>Standard</TableHead>
            <TableHead>Conc</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.syn_id ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">
                <Link to="/lab-logs/standard-preparations/$id" params={{ id: r.id }} className="hover:underline">{r.log_number}</Link>
              </TableCell>
              <TableCell>{r.standard_name}</TableCell>
              <TableCell className="text-muted-foreground">{r.target_concentration ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.final_volume ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.expiration_date ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>
                  {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPrepsForReceipt } from "@/lib/standard-preparations.functions";
import { STATUS_LABEL } from "@/lib/lims-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk } from "@/lib/query-keys";

/**
 * Lists every standard preparation that draws from this material receipt.
 * Fetches independently because it's a secondary panel; the receipt detail
 * still renders even if this query is slow or fails.
 */
export function LinkedPreparations({ receiptId }: { receiptId: string }) {
  const list = useServerFn(listPrepsForReceipt);
  const { data, isLoading } = useQuery({
    queryKey: qk.materialReceipts.preps(receiptId),
    queryFn: () => list({ data: { receipt_id: receiptId } }),
  });
  return (
    <Card className="p-5 mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Standards Prepared From This Receipt
      </h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-2">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No preparations linked yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Log #</TableHead>
                <TableHead>SYX ID</TableHead>
                <TableHead>Standard</TableHead>
                <TableHead>Analyst</TableHead>
                <TableHead>Prepared</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to="/lab-logs/standard-preparations/$id" params={{ id: p.id }} className="hover:underline">
                      {p.log_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.syn_id ?? "—"}</TableCell>
                  <TableCell>{p.standard_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.analyst_name}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.prepared_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">{p.expiration_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "approved" ? "default" : p.status === "reviewed" ? "secondary" : "outline"}>
                      {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
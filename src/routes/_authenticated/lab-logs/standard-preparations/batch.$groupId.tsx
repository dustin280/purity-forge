import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { getStandardPreparationBatch } from "@/lib/standard-preparations.functions";
import { STATUS_LABEL } from "@/lib/lims-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/batch/$groupId")({
  component: BatchView,
});

function BatchView() {
  const { groupId } = Route.useParams();
  const get = useServerFn(getStandardPreparationBatch);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["prep-batch", groupId],
    queryFn: () => get({ data: { group_id: groupId } }),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="p-8 text-sm text-destructive">Batch not found.</div>;

  const head = rows[0];
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  };
  const allIds = rows.map(r => r.syn_id).filter(Boolean).join("\n");
  const summary = [
    `Batch prepared ${new Date(head.prepared_at).toLocaleString()} by ${head.analyst_name}`,
    head.ref_material_name ? `Reference: ${head.ref_material_name} (Lot ${head.ref_lot ?? "—"})` : "",
    `Standards: ${rows.length}`,
    "",
    ...rows.map(r => `${r.syn_id ?? r.log_number}  ${r.standard_name}  ${r.target_concentration ?? ""}  ${r.final_volume ?? ""}`),
  ].filter(Boolean).join("\n");

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Batch</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{rows.length} standards prepared</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {new Date(head.prepared_at).toLocaleString()} · {head.analyst_name}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(allIds, "SYN IDs")}><Copy className="size-4 mr-1" /> Copy IDs</Button>
          <Button variant="outline" size="sm" onClick={() => copy(summary, "Summary")}><Copy className="size-4 mr-1" /> Copy summary</Button>
        </div>
      </div>

      {head.material_receipt && (
        <Card className="p-4 mb-4 text-sm">
          <div className="text-xs text-muted-foreground mb-1">Reference Material</div>
          <Link to="/material-receipts/$id" params={{ id: head.material_receipt.id }} className="hover:underline">
            <span className="font-mono">{head.material_receipt.receipt_number}</span> — {head.material_receipt.material_name}
            {head.material_receipt.internal_lot ? ` (lot ${head.material_receipt.internal_lot})` : ""}
          </Link>
        </Card>
      )}

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
    </div>
  );
}
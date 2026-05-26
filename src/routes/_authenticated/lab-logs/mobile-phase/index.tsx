import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useMobilePhasePreps } from "@/components/mobile-phase/use-mobile-phase";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/lab-logs/mobile-phase/")({
  component: MobilePhaseList,
});

function MobilePhaseList() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { query, deleteMut } = useMobilePhasePreps();
  const rows = query.data ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Mobile Phase Prep Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Document A/B mobile phase preparations. Instructions are auto-generated and saved with each record.
          </p>
        </div>
        <Link to="/lab-logs/mobile-phase/new">
          <Button><Plus className="size-4 mr-1" /> New prep</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Log #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Initials</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>A / B</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No preparations yet.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link to="/lab-logs/mobile-phase/$id" params={{ id: r.id }} className="font-mono text-xs hover:underline">
                    {r.log_number}
                  </Link>
                </TableCell>
                <TableCell>{r.prepared_at.slice(0, 10)}</TableCell>
                <TableCell>{r.user_initials}</TableCell>
                <TableCell className="font-mono text-xs">{r.lot_number}</TableCell>
                <TableCell>{r.total_volume} {r.total_volume_unit}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {r.prep_a?.enabled && <Badge variant="secondary">A</Badge>}
                    {r.prep_b?.enabled && <Badge variant="secondary">B</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <Button
                      size="icon" variant="ghost"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm("Delete this prep?")) deleteMut.mutate(r.id); }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
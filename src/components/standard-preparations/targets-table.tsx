import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PrepTargetRow } from "@/lib/standard-preparations.functions";

/** Renders the list of desired standards (targets) attached to a preparation. */
export function TargetsTable({ targets }: { targets: PrepTargetRow[] }) {
  if (!targets || targets.length === 0) return null;
  return (
    <Card className="p-5 mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Desired Standards ({targets.length})
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Conc (mg/mL)</TableHead>
              <TableHead className="text-right">Vol (mL)</TableHead>
              <TableHead className="text-right">Mass (mg)</TableHead>
              <TableHead className="text-right">Calc Vol (mL)</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{t.row_no}</TableCell>
                <TableCell>{t.name || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{t.target_concentration_mg_per_ml ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{t.target_volume_ml ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{t.calculated_mass_mg != null ? Number(t.calculated_mass_mg).toFixed(3) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{t.calculated_volume_ml != null ? Number(t.calculated_volume_ml).toFixed(3) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.notes || ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
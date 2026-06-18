import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listInventory, type InventoryStatus, type InventoryCategory } from "@/lib/inventory.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: InventoryIndex,
});

const STATUS_LABEL: Record<InventoryStatus, string> = {
  in_use: "In use",
  working_not_in_use: "Working · not in use",
  discarded: "Discarded",
};
const STATUS_VARIANT: Record<InventoryStatus, "default" | "secondary" | "outline"> = {
  in_use: "default",
  working_not_in_use: "secondary",
  discarded: "outline",
};
const CAT_LABEL: Record<InventoryCategory, string> = {
  instrument: "Instrument",
  column: "Column",
  accessory: "Accessory",
  other: "Other",
};

function InventoryIndex() {
  const list = useServerFn(listInventory);
  const { data, isLoading } = useQuery({
    queryKey: qk.inventory.list(),
    queryFn: () => list(),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Assets</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
            <Boxes className="size-6" /> Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Instruments, columns, accessories and other lab equipment.
          </p>
        </div>
        <Button asChild>
          <Link to="/inventory/new"><Plus className="size-4 mr-1" /> Add inventory</Link>
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Make / Model</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead>Installed</TableHead>
              <TableHead>Installer</TableHead>
              <TableHead>Components</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No inventory yet.</TableCell></TableRow>
            )}
            {(data ?? []).map(it => (
              <TableRow key={it.id}>
                <TableCell><Badge variant="outline">{CAT_LABEL[it.category]}</Badge></TableCell>
                <TableCell className="font-medium">
                  {[it.make, it.model].filter(Boolean).join(" · ") || "—"}
                  {it.description && <div className="text-xs text-muted-foreground">{it.description}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{it.serial_number || "—"}</TableCell>
                <TableCell className="text-xs">{it.installation_date || "—"}</TableCell>
                <TableCell className="text-xs">{it.installer_initials || "—"}</TableCell>
                <TableCell className="text-xs">{it.components.length || "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[it.status]}>{STATUS_LABEL[it.status]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
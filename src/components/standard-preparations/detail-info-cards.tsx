/**
 * Two side-by-side summary cards on the prep detail page: preparation
 * parameters and storage/linkage. The linked Material Receipt (if any) is
 * rendered as a deep link to the receipt detail page.
 */
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { InfoRow } from "./info-row";
import type { LinkedReceipt } from "@/lib/standard-preparation-pdf";

type RowLike = {
  prepared_at: string;
  analyst_name: string;
  target_concentration?: string | null;
  final_volume?: string | null;
  solvent?: string | null;
  manufacturer_lot?: string | null;
  expiration_date?: string | null;
  storage_condition?: string | null;
  storage_location?: string | null;
  container_label?: string | null;
};

export function PrepDetailInfoCards({ row, linked }: { row: RowLike; linked: LinkedReceipt }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <Card className="p-5 space-y-2 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preparation</h2>
        <InfoRow label="Prepared" value={new Date(row.prepared_at).toLocaleString()} />
        <InfoRow label="Analyst" value={row.analyst_name} />
        <InfoRow label="Target conc." value={row.target_concentration} />
        <InfoRow label="Final volume" value={row.final_volume} />
        <InfoRow label="Solvent" value={row.solvent} />
        <InfoRow label="Mfr. lot" value={row.manufacturer_lot} />
      </Card>
      <Card className="p-5 space-y-2 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Storage & Linkage</h2>
        <InfoRow label="Expiration" value={row.expiration_date} />
        <InfoRow label="Condition" value={row.storage_condition} />
        <InfoRow label="Location" value={row.storage_location} />
        <InfoRow label="Container label" value={row.container_label} />
        {linked ? (
          <div className="pt-2 mt-2 border-t">
            <div className="text-xs text-muted-foreground mb-1">Linked Material Receipt</div>
            <Link to="/material-receipts/$id" params={{ id: linked.id }} className="text-sm hover:underline">
              <span className="font-mono">{linked.receipt_number}</span> — {linked.material_name}
              {linked.internal_lot ? ` (lot ${linked.internal_lot})` : ""}
            </Link>
          </div>
        ) : (
          <InfoRow label="Linked receipt" value={null} />
        )}
      </Card>
    </div>
  );
}
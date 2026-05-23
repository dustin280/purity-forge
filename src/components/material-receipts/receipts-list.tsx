import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageSearch, ChevronRight } from "lucide-react";

export interface ReceiptListItem {
  id: string;
  receipt_number: string;
  material_type: "controlled" | "uncontrolled";
  quarantine_status: string | null;
  material_name: string;
  supplier: string | null;
  quantity: number | null;
  unit: string | null;
  received_at: string;
  manufacturer_lot: string | null;
}

interface Props {
  rows: ReceiptListItem[];
  isLoading: boolean;
}

export function ReceiptsList({ rows, isLoading }: Props) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <PackageSearch className="size-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">No receipts match your filters.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Link key={r.id} to="/material-receipts/$id" params={{ id: r.id }} className="block">
          <Card className="p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{r.receipt_number}</span>
                  <Badge variant={r.material_type === "controlled" ? "default" : "secondary"}>
                    {r.material_type}
                  </Badge>
                  {r.material_type === "controlled" && r.quarantine_status && (
                    <Badge variant={
                      r.quarantine_status === "released" ? "default"
                        : r.quarantine_status === "rejected" ? "destructive"
                          : "outline"
                    }>
                      {r.quarantine_status}
                    </Badge>
                  )}
                </div>
                <div className="font-medium mt-1 truncate">{r.material_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {r.supplier ?? "—"} ·{" "}
                  {r.quantity != null ? `${r.quantity}${r.unit ?? ""}` : "qty —"} ·{" "}
                  {new Date(r.received_at).toLocaleString()}
                  {r.manufacturer_lot ? ` · Lot ${r.manufacturer_lot}` : ""}
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
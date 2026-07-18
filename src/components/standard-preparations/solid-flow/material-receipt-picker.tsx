import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, PackageCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { searchMaterialReceiptsOldestFirst } from "@/lib/standard-preparations.functions";

export interface PickedReceipt {
  id: string;
  receipt_number: string;
  material_name: string;
  manufacturer: string | null;
  internal_lot: string | null;
  manufacturer_lot: string | null;
  purity_percent: number | null;
  molecular_weight: number | null;
  received_at: string;
  expiry_date: string | null;
}

interface Props {
  placeholder?: string;
  onPick: (r: PickedReceipt) => void;
  onAddNew?: () => void;
}

export function MaterialReceiptPicker({ placeholder = "Search material name or lot…", onPick, onAddNew }: Props) {
  const [q, setQ] = useState("");
  const search = useServerFn(searchMaterialReceiptsOldestFirst);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["receipt-oldest-first", q],
    queryFn: () => search({ data: { q: q.trim() || null, limit: 20 } }) as Promise<PickedReceipt[]>,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
      <Card className="p-1 max-h-64 overflow-auto">
        {isFetching && rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Searching…</div>
        )}
        {!isFetching && rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">
            No matching receipts. {onAddNew && (
              <button type="button" className="text-primary underline" onClick={onAddNew}>
                Add Material Receipt
              </button>
            )}
          </div>
        )}
        {rows.map((r: PickedReceipt) => (
          <button
            type="button"
            key={r.id}
            onClick={() => onPick(r as PickedReceipt)}
            className="w-full text-left p-2 rounded-md hover:bg-accent focus:bg-accent focus:outline-none flex items-start gap-2"
          >
            <PackageCheck className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{r.material_name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {r.receipt_number} · Lot {r.internal_lot || r.manufacturer_lot || "—"}
                {r.manufacturer ? ` · ${r.manufacturer}` : ""}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Received {new Date(r.received_at).toLocaleDateString()}
                {r.expiry_date ? ` · Expires ${r.expiry_date}` : ""}
                {r.purity_percent != null ? ` · ${r.purity_percent}% purity` : ""}
              </div>
            </div>
          </button>
        ))}
      </Card>
      {onAddNew && (
        <Button type="button" variant="outline" size="sm" onClick={onAddNew}>
          + Add Material Receipt
        </Button>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMaterialReceipts } from "@/lib/material-receipts.functions";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Camera } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { ReceiptsFiltersCard, type MaterialTypeFilter } from "@/components/material-receipts/filters-card";
import { ReceiptsList } from "@/components/material-receipts/receipts-list";
import { ScanNewItemDialog } from "@/components/material-receipts/scan-dialog";
export const Route = createFileRoute("/_authenticated/material-receipts/")({
  component: ReceiptsIndex,
});

function ReceiptsIndex() {
  const list = useServerFn(listMaterialReceipts);
  const [q, setQ] = useState("");
  const [materialType, setMaterialType] = useState<MaterialTypeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const filters = useMemo(
    () => ({
      q: q || null,
      material_type: materialType === "all" ? null : materialType,
      from: from || null,
      to: to || null,
    }),
    [q, materialType, from, to],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.materialReceipts.list(filters),
    queryFn: () => list({ data: filters }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Material Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log incoming controlled and uncontrolled materials. Full audit trail and printable records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setScanOpen(true)}><Camera className="size-4 mr-1" /> Scan New Item</Button>
          <Link to="/material-receipts/accounting-report">
            <Button variant="outline"><FileText className="size-4 mr-1" /> Accounting Report</Button>
          </Link>
          <Link to="/material-receipts/new">
            <Button variant="outline"><Plus className="size-4 mr-1" /> New Receipt</Button>
          </Link>
        </div>
      </div>

      <ReceiptsFiltersCard
        q={q} onQChange={setQ}
        materialType={materialType} onMaterialTypeChange={setMaterialType}
        from={from} onFromChange={setFrom}
        to={to} onToChange={setTo}
      />

      <ReceiptsList rows={rows} isLoading={isLoading} />

      <ScanNewItemDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}
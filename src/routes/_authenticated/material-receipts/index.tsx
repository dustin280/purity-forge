import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMaterialReceipts } from "@/lib/material-receipts.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PackageSearch, ChevronRight } from "lucide-react";
import { qk } from "@/lib/query-keys";
export const Route = createFileRoute("/_authenticated/material-receipts/")({
  component: ReceiptsIndex,
});

function ReceiptsIndex() {
  const list = useServerFn(listMaterialReceipts);
  const [q, setQ] = useState("");
  const [materialType, setMaterialType] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(
    () => ({
      q: q || null,
      material_type: materialType === "all" ? null : (materialType as "controlled" | "uncontrolled"),
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
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Material Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log incoming controlled and uncontrolled materials. Full audit trail and printable records.
          </p>
        </div>
        <Link to="/material-receipts/new">
          <Button><Plus className="size-4 mr-1" /> New Receipt</Button>
        </Link>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Search</label>
            <Input
              placeholder="Receipt #, material, lot, supplier…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Material type</label>
            <Select value={materialType} onValueChange={setMaterialType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="controlled">Controlled</SelectItem>
                <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <PackageSearch className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No receipts match your filters.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              to="/material-receipts/$id"
              params={{ id: r.id }}
              className="block"
            >
              <Card className="p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{r.receipt_number}</span>
                      <Badge variant={r.material_type === "controlled" ? "default" : "secondary"}>
                        {r.material_type}
                      </Badge>
                      {r.material_type === "controlled" && (
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
      )}
    </div>
  );
}
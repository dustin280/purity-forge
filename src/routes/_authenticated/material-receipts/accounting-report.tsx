import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMaterialReceiptsForAccounting } from "@/lib/material-receipts/receipts-crud.functions";
import { downloadAccountingCsv, downloadAccountingPdf } from "@/lib/material-receipts/accounting-export";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/material-receipts/accounting-report")({
  component: AccountingReport,
});

function defaultFrom(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function AccountingReport() {
  const list = useServerFn(listMaterialReceiptsForAccounting);
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [materialType, setMaterialType] = useState<"all" | "controlled" | "uncontrolled">("all");
  const [dateField, setDateField] = useState<"received_at" | "invoice_date">("received_at");

  const filters = useMemo(
    () => ({
      from,
      to,
      material_type: materialType === "all" ? null : materialType,
      date_field: dateField,
    }),
    [from, to, materialType, dateField],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.materialReceipts.accountingReport(filters),
    queryFn: () => list({ data: filters }),
    enabled: !!from && !!to,
  });

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t =
        (r.total_price ?? (r.unit_price != null && r.quantity != null ? r.unit_price * r.quantity : 0)) +
        (r.tax_amount ?? 0) +
        (r.shipping_cost ?? 0);
      const c = r.currency ?? "USD";
      m.set(c, (m.get(c) ?? 0) + Number(t));
    }
    return Array.from(m.entries());
  }, [rows]);

  const filename = `material-receipts-accounting_${from}_to_${to}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/material-receipts">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
      </Link>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Material Receipts</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Accounting Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export financial data from material receipts for the accounting department.
          </p>
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Date field</label>
            <Select value={dateField} onValueChange={(v) => setDateField(v as typeof dateField)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="received_at">Received date</SelectItem>
                <SelectItem value="invoice_date">Invoice date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Material type</label>
            <Select value={materialType} onValueChange={(v) => setMaterialType(v as typeof materialType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="controlled">Controlled</SelectItem>
                <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${rows.length} receipt${rows.length === 1 ? "" : "s"} · Totals: ${
                  totals.length === 0 ? "—" : totals.map(([c, v]) => `${c} ${v.toFixed(2)}`).join("   ")
                }`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadAccountingCsv(rows, `${filename}.csv`)}
              disabled={rows.length === 0}
            >
              <Download className="size-4 mr-1" /> CSV
            </Button>
            <Button
              onClick={() =>
                downloadAccountingPdf(rows, {
                  from,
                  to,
                  filename: `${filename}.pdf`,
                  dateField: dateField === "received_at" ? "Received date" : "Invoice date",
                })
              }
              disabled={rows.length === 0}
            >
              <FileText className="size-4 mr-1" /> PDF
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-2">Receipt #</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Inv. date</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit $</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Tax</th>
              <th className="px-3 py-2 text-right">Ship</th>
              <th className="px-3 py-2 text-right">Grand</th>
              <th className="px-3 py-2">Cur</th>
              <th className="px-3 py-2">GL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t =
                r.total_price ??
                (r.unit_price != null && r.quantity != null ? r.unit_price * r.quantity : 0);
              const grand = Number(t) + Number(r.tax_amount ?? 0) + Number(r.shipping_cost ?? 0);
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono text-xs">{r.receipt_number}</td>
                  <td className="px-3 py-2">{r.received_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">{r.invoice_number ?? "—"}</td>
                  <td className="px-3 py-2">{r.invoice_date ?? "—"}</td>
                  <td className="px-3 py-2">{r.supplier ?? "—"}</td>
                  <td className="px-3 py-2">{r.material_name}</td>
                  <td className="px-3 py-2 text-right">
                    {r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.unit_price ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.total_price ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.tax_amount ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.shipping_cost ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{grand.toFixed(2)}</td>
                  <td className="px-3 py-2">{r.currency ?? "USD"}</td>
                  <td className="px-3 py-2">{r.gl_account ?? "—"}</td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-muted-foreground">
                  No receipts in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReceiptField } from "./receipt-field";
import type { ReceiptFormValues } from "./receipt-form-logic";

export function ReceiptFinancialCard({
  v,
  up,
}: {
  v: ReceiptFormValues;
  up: <K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) => void;
}) {
  const computedTotal = useMemo(() => {
    const q = parseFloat(v.quantity);
    const u = parseFloat(v.unit_price);
    if (!isFinite(q) || !isFinite(u)) return "";
    return (q * u).toFixed(2);
  }, [v.quantity, v.unit_price]);

  const grand = useMemo(() => {
    const t = parseFloat(v.total_price || computedTotal);
    const tax = parseFloat(v.tax_amount) || 0;
    const ship = parseFloat(v.shipping_cost) || 0;
    if (!isFinite(t)) return null;
    return (t + tax + ship).toFixed(2);
  }, [v.total_price, v.tax_amount, v.shipping_cost, computedTotal]);

  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Financial / Accounting
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        <ReceiptField label="Unit price">
          <Input
            type="number"
            step="any"
            min="0"
            value={v.unit_price}
            onChange={(e) => up("unit_price", e.target.value)}
            placeholder="0.00"
          />
        </ReceiptField>
        <ReceiptField label="Currency">
          <Input
            value={v.currency}
            onChange={(e) => up("currency", e.target.value.toUpperCase())}
            maxLength={10}
            placeholder="USD"
          />
        </ReceiptField>
        <ReceiptField label={`Total price${computedTotal && !v.total_price ? ` (auto: ${computedTotal})` : ""}`}>
          <Input
            type="number"
            step="any"
            min="0"
            value={v.total_price}
            onChange={(e) => up("total_price", e.target.value)}
            placeholder={computedTotal || "0.00"}
          />
        </ReceiptField>
        <ReceiptField label="Tax amount">
          <Input
            type="number"
            step="any"
            min="0"
            value={v.tax_amount}
            onChange={(e) => up("tax_amount", e.target.value)}
            placeholder="0.00"
          />
        </ReceiptField>
        <ReceiptField label="Shipping cost">
          <Input
            type="number"
            step="any"
            min="0"
            value={v.shipping_cost}
            onChange={(e) => up("shipping_cost", e.target.value)}
            placeholder="0.00"
          />
        </ReceiptField>
        <ReceiptField label="GL / Cost center account">
          <Input
            value={v.gl_account}
            onChange={(e) => up("gl_account", e.target.value)}
            maxLength={100}
            placeholder="e.g. 5200-LAB"
          />
        </ReceiptField>
        <ReceiptField label="Invoice number">
          <Input
            value={v.invoice_number}
            onChange={(e) => up("invoice_number", e.target.value)}
            maxLength={100}
          />
        </ReceiptField>
        <ReceiptField label="Invoice date">
          <Input
            type="date"
            value={v.invoice_date}
            onChange={(e) => up("invoice_date", e.target.value)}
          />
        </ReceiptField>
        {grand && (
          <div className="flex items-end">
            <div className="text-sm">
              <div className="text-xs text-muted-foreground">Grand total</div>
              <div className="font-semibold">
                {grand} {v.currency || "USD"}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReceiptField } from "./receipt-field";
import type { ReceiptFormValues } from "./receipt-form-logic";

export function ReceiptManufacturerCard({
  v,
  up,
}: {
  v: ReceiptFormValues;
  up: <K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Manufacturer & Lot</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ReceiptField label="Manufacturer">
          <Input value={v.manufacturer} onChange={e => up("manufacturer", e.target.value)} maxLength={255} />
        </ReceiptField>
        <ReceiptField label="Manufacturer batch / lot #">
          <Input value={v.manufacturer_lot} onChange={e => up("manufacturer_lot", e.target.value)} maxLength={100} />
        </ReceiptField>
        <ReceiptField label="Catalog / part number">
          <Input value={v.catalog_number} onChange={e => up("catalog_number", e.target.value)} maxLength={100} />
        </ReceiptField>
        <ReceiptField label="Serial number">
          <Input value={v.serial_number} onChange={e => up("serial_number", e.target.value)} maxLength={100} />
        </ReceiptField>
        <ReceiptField label="Expiry / retest date">
          <Input type="date" value={v.expiry_date} onChange={e => up("expiry_date", e.target.value)} />
        </ReceiptField>
        <ReceiptField label="Container (size, type, condition)" className="md:col-span-2">
          <Input value={v.container_details} onChange={e => up("container_details", e.target.value)} maxLength={500} />
        </ReceiptField>
        <ReceiptField label="Purity (%)">
          <Input type="number" step="any" min={0} max={100} value={v.purity_percent} onChange={e => up("purity_percent", e.target.value)} placeholder="e.g. 99.5" />
        </ReceiptField>
        <ReceiptField label="Molecular weight (g/mol)">
          <Input type="number" step="any" min={0} value={v.molecular_weight} onChange={e => up("molecular_weight", e.target.value)} placeholder="e.g. 1046.18" />
        </ReceiptField>
        <ReceiptField label="Shelf life (months)">
          <Input type="number" step={1} min={0} value={v.shelf_life_months} onChange={e => up("shelf_life_months", e.target.value)} placeholder="e.g. 24" />
        </ReceiptField>
      </div>
    </Card>
  );
}
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUARANTINE_STATUSES, type QuarantineStatus } from "@/lib/material-receipts.functions";
import { ReceiptField } from "./receipt-field";
import type { ReceiptFormValues } from "./receipt-form-logic";

export function ReceiptQcCard({
  v,
  up,
}: {
  v: ReceiptFormValues;
  up: <K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Internal Tracking & QC</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ReceiptField label="Assigned internal lot / control #">
          <Input value={v.internal_lot} onChange={e => up("internal_lot", e.target.value)} maxLength={100} />
        </ReceiptField>
        <ReceiptField label="Storage location / condition">
          <Input value={v.storage_location} onChange={e => up("storage_location", e.target.value)} maxLength={255} />
        </ReceiptField>
        <ReceiptField label="Quarantine status">
          <Select value={v.quarantine_status} onValueChange={val => up("quarantine_status", val as QuarantineStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUARANTINE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReceiptField>
        <ReceiptField label="QC pass / fail">
          <Select value={v.qc_pass} onValueChange={val => up("qc_pass", val as "" | "pass" | "fail")}>
            <SelectTrigger><SelectValue placeholder="Not In Review" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </ReceiptField>
        <ReceiptField label="QC analyst">
          <Input value={v.qc_analyst} onChange={e => up("qc_analyst", e.target.value)} maxLength={255} />
        </ReceiptField>
        <ReceiptField label="QC date">
          <Input type="date" value={v.qc_date} onChange={e => up("qc_date", e.target.value)} />
        </ReceiptField>
        <ReceiptField label="QC results summary" className="md:col-span-2">
          <Textarea value={v.qc_results} onChange={e => up("qc_results", e.target.value)} rows={3} maxLength={2000} />
        </ReceiptField>
      </div>
    </Card>
  );
}
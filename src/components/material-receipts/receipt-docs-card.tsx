import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptField } from "./receipt-field";
import { FileSlot } from "./receipt-file-slot";
import { VISUAL_INSPECTION_OPTIONS, type ReceiptFormValues } from "./receipt-form-logic";

export function ReceiptDocsCard({
  v,
  up,
  coaFiles,
  setCoaFiles,
  sdsFiles,
  setSdsFiles,
}: {
  v: ReceiptFormValues;
  up: <K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) => void;
  coaFiles: File[];
  setCoaFiles: (updater: (prev: File[]) => File[]) => void;
  sdsFiles: File[];
  setSdsFiles: (updater: (prev: File[]) => File[]) => void;
}) {
  const coaRef = useRef<HTMLInputElement>(null);
  const sdsRef = useRef<HTMLInputElement>(null);
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Documentation & Tracking</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ReceiptField label="Freight tracking number" className="md:col-span-2">
          <Input
            value={v.freight_tracking_number}
            onChange={e => up("freight_tracking_number", e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
            maxLength={255}
          />
        </ReceiptField>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <FileSlot
          title="COA (Certificate of Analysis)"
          files={coaFiles}
          existing={v.coa_attached}
          onPick={() => coaRef.current?.click()}
          onRemove={(i) => setCoaFiles(prev => prev.filter((_, idx) => idx !== i))}
        />
        <input
          ref={coaRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) setCoaFiles(prev => [...prev, ...files]);
            e.target.value = "";
          }}
        />
        <FileSlot
          title="SDS (Safety Data Sheet)"
          files={sdsFiles}
          existing={v.sds_attached}
          onPick={() => sdsRef.current?.click()}
          onRemove={(i) => setSdsFiles(prev => prev.filter((_, idx) => idx !== i))}
        />
        <input
          ref={sdsRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) setSdsFiles(prev => [...prev, ...files]);
            e.target.value = "";
          }}
        />
        <ReceiptField label="Visual inspection result">
          <Select value={v.visual_inspection} onValueChange={val => up("visual_inspection", val)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {VISUAL_INSPECTION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReceiptField>
        <ReceiptField label="Temperature on receipt (°C)">
          <Input type="number" step="any" value={v.temperature_on_receipt} onChange={e => up("temperature_on_receipt", e.target.value)} />
        </ReceiptField>
        <ReceiptField label="Visual inspection notes" className="md:col-span-2">
          <Textarea value={v.visual_inspection_notes} onChange={e => up("visual_inspection_notes", e.target.value)} rows={2} maxLength={2000} />
        </ReceiptField>
      </div>
    </Card>
  );
}
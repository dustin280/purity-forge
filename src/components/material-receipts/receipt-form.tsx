import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listMaterialSuggestions } from "@/lib/material-receipts.functions";
import { qk } from "@/lib/query-keys";
import {
  emptyValues,
  type ReceiptFormValues,
  type PendingAttachments,
  type MaterialSuggestion,
} from "./receipt-form-logic";
import { ReceiptField } from "./receipt-field";
import { MaterialTypeCard } from "./receipt-type-card";
import { ReceiptCommonCard } from "./receipt-common-card";
import { ReceiptManufacturerCard } from "./receipt-manufacturer-card";
import { ReceiptDocsCard } from "./receipt-docs-card";
import { ReceiptQcCard } from "./receipt-qc-card";

// Re-exports for callers that imported from this module historically.
export {
  emptyValues,
  valuesToPayload,
  VISUAL_INSPECTION_OPTIONS,
} from "./receipt-form-logic";
export type {
  ReceiptFormValues,
  PendingAttachments,
} from "./receipt-form-logic";

interface Props {
  initial?: Partial<ReceiptFormValues>;
  defaultReceiverName: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: ReceiptFormValues, pending: PendingAttachments) => void;
  onCancel?: () => void;
}

export function ReceiptForm({ initial, defaultReceiverName, submitting, submitLabel = "Save Receipt", onSubmit, onCancel }: Props) {
  const [v, setV] = useState<ReceiptFormValues>(() => ({ ...emptyValues(defaultReceiverName), ...initial }));
  const [coaFiles, setCoaFiles] = useState<File[]>([]);
  const [sdsFiles, setSdsFiles] = useState<File[]>([]);
  const listSuggestions = useServerFn(listMaterialSuggestions);
  const { data: suggestions = [] } = useQuery({
    queryKey: qk.materialReceipts.suggestions(),
    queryFn: () => listSuggestions() as Promise<MaterialSuggestion[]>,
  });

  useEffect(() => {
    if (!initial && !v.receiver_name && defaultReceiverName) {
      setV(prev => ({ ...prev, receiver_name: defaultReceiverName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultReceiverName]);

  const filteredSuggestions = useMemo(
    () => suggestions.filter(s => s.material_type === v.material_type),
    [suggestions, v.material_type],
  );

  function up<K extends keyof ReceiptFormValues>(k: K, val: ReceiptFormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  function handleSuggestionPick(name: string) {
    if (!name) return;
    const match = filteredSuggestions.find(s => s.name === name);
    setV(prev => ({
      ...prev,
      material_name: name,
      manufacturer: prev.manufacturer || match?.manufacturer || "",
      catalog_number: prev.catalog_number || match?.catalog_number || "",
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const values: ReceiptFormValues = {
      ...v,
      coa_attached: v.coa_attached || coaFiles.length > 0,
      sds_attached: v.sds_attached || sdsFiles.length > 0,
    };
    onSubmit(values, { coa: coaFiles, sds: sdsFiles });
  }

  const isControlled = v.material_type === "controlled";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <MaterialTypeCard value={v.material_type} onChange={(t) => up("material_type", t)} />
      <ReceiptCommonCard
        v={v}
        up={up}
        filteredSuggestions={filteredSuggestions}
        onPickSuggestion={handleSuggestionPick}
      />

      {isControlled ? (
        <>
          <ReceiptManufacturerCard v={v} up={up} />
          <ReceiptDocsCard
            v={v}
            up={up}
            coaFiles={coaFiles}
            setCoaFiles={setCoaFiles}
            sdsFiles={sdsFiles}
            setSdsFiles={setSdsFiles}
          />
          <ReceiptQcCard v={v} up={up} />
        </>
      ) : (
        <Card className="p-5">
          <ReceiptField label="Purpose (e.g. general lab use)">
            <Input value={v.purpose} onChange={e => up("purpose", e.target.value)} maxLength={500} />
          </ReceiptField>
        </Card>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

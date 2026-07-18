import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptForm, valuesToPayload, type PendingAttachments } from "@/components/material-receipts/receipt-form";
import { createMaterialReceipt, recordAttachment } from "@/lib/material-receipts.functions";
import { uploadPending } from "@/routes/_authenticated/material-receipts/new";
import { qk } from "@/lib/query-keys";
import type { PickedReceipt } from "./material-receipt-picker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultReceiverName: string;
  onCreated: (r: PickedReceipt) => void;
}

export function AddReceiptDialog({ open, onOpenChange, defaultReceiverName, onCreated }: Props) {
  const qc = useQueryClient();
  const create = useServerFn(createMaterialReceipt);
  const record = useServerFn(recordAttachment);

  const mut = useMutation({
    mutationFn: async (args: { payload: ReturnType<typeof valuesToPayload>; pending: PendingAttachments }) => {
      const row = await create({ data: args.payload });
      await uploadPending(row.id, args.pending, record);
      return row;
    },
    onSuccess: (row) => {
      toast.success(`Created ${row.receipt_number}`);
      qc.invalidateQueries({ queryKey: qk.materialReceipts.all });
      qc.invalidateQueries({ queryKey: ["receipt-oldest-first"] });
      onCreated({
        id: row.id,
        receipt_number: row.receipt_number,
        material_name: row.material_name,
        manufacturer: row.manufacturer,
        internal_lot: row.internal_lot,
        manufacturer_lot: row.manufacturer_lot,
        purity_percent: row.purity_percent,
        molecular_weight: row.molecular_weight,
        received_at: row.received_at,
        expiry_date: row.expiry_date,
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Material Receipt</DialogTitle>
        </DialogHeader>
        <ReceiptForm
          defaultReceiverName={defaultReceiverName}
          submitting={mut.isPending}
          submitLabel="Save Receipt"
          onSubmit={(v, pending) => mut.mutate({ payload: valuesToPayload(v), pending })}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

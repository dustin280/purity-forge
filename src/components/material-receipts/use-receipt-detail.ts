import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveMaterialReceipt,
  deleteMaterialReceipt,
  getMaterialReceipt,
  recordAttachment,
  updateMaterialReceipt,
} from "@/lib/material-receipts.functions";
import { valuesToPayload, type PendingAttachments } from "@/components/material-receipts/receipt-form";
import { uploadPending } from "@/routes/_authenticated/material-receipts/new";
import { qk } from "@/lib/query-keys";

export function useReceiptDetail(id: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getMaterialReceipt);
  const update = useServerFn(updateMaterialReceipt);
  const del = useServerFn(deleteMaterialReceipt);
  const approve = useServerFn(approveMaterialReceipt);
  const record = useServerFn(recordAttachment);

  const query = useQuery({
    queryKey: qk.materialReceipts.detail(id),
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: async (args: { patch: ReturnType<typeof valuesToPayload>; pending: PendingAttachments }) => {
      const row = await update({ data: { id, patch: args.patch } });
      await uploadPending(id, args.pending, record);
      return row;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(id) });
      qc.invalidateQueries({ queryKey: qk.materialReceipts.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Receipt deleted");
      navigate({ to: "/material-receipts" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (args: { approver_name: string; qc_pass: boolean }) =>
      approve({ data: { id, ...args } }),
    onSuccess: () => {
      toast.success("Receipt updated");
      qc.invalidateQueries({ queryKey: qk.materialReceipts.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, updateMut, deleteMut, approveMut };
}
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createMaterialReceipt, recordAttachment } from "@/lib/material-receipts.functions";
import { ReceiptForm, valuesToPayload, type PendingAttachments } from "@/components/material-receipts/receipt-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/material-receipts/new")({
  component: NewReceipt,
});

function NewReceipt() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Only prefill when we actually have a human name on the profile —
  // never fall back to email for the Receiver field.
  const defaultName = profileDisplayName(profile, null);
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
      navigate({ to: "/material-receipts/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <Link to="/material-receipts">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <h1 className="text-3xl font-bold tracking-tight mb-1">New Material Receipt</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A unique receipt number will be assigned automatically once saved.
      </p>
      <ReceiptForm
        defaultReceiverName={defaultName}
        submitting={mut.isPending}
        submitLabel="Create Receipt"
        onSubmit={(v, pending) => mut.mutate({ payload: valuesToPayload(v), pending })}
        onCancel={() => navigate({ to: "/material-receipts" })}
      />
    </div>
  );
}

export async function uploadPending(
  receiptId: string,
  pending: PendingAttachments,
  record: (args: { data: { receipt_id: string; kind: "coa" | "sds"; file_path: string; file_name: string; content_type: string | null; size_bytes: number } }) => Promise<unknown>,
) {
  const jobs: Array<{ kind: "coa" | "sds"; file: File }> = [
    ...pending.coa.map(file => ({ kind: "coa" as const, file })),
    ...pending.sds.map(file => ({ kind: "sds" as const, file })),
  ];
  for (const { kind, file } of jobs) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${receiptId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("material-receipts").upload(path, file);
    if (upErr) throw upErr;
    await record({
      data: {
        receipt_id: receiptId,
        kind,
        file_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
      },
    });
  }
}
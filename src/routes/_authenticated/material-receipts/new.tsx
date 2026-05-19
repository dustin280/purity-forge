import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createMaterialReceipt } from "@/lib/material-receipts.functions";
import { ReceiptForm, valuesToPayload } from "@/components/material-receipts/receipt-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

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

  const mut = useMutation({
    mutationFn: (payload: ReturnType<typeof valuesToPayload>) => create({ data: payload }),
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
        onSubmit={(v) => mut.mutate(valuesToPayload(v))}
        onCancel={() => navigate({ to: "/material-receipts" })}
      />
    </div>
  );
}
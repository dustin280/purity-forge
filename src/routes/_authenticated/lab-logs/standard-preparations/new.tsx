import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createStandardPreparationBatch } from "@/lib/standard-preparations.functions";
import { PrepForm, clearPrepDraft } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { analystInitials, synDatePart } from "@/lib/lims-utils";
import { Button } from "@/components/ui/button";
import { valuesToBatchPayload } from "@/components/standard-preparations/prep-batch-payload";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/new")({
  component: NewPrep,
});

function NewPrep() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const defaultAnalystName = profileDisplayName(profile, null);
  const userToken = analystInitials(profile, user?.email ?? null);
  const synPreviewPrefix = `SYX_${synDatePart(new Date())}_${userToken}_`;
  const createBatch = useServerFn(createStandardPreparationBatch);

  const DRAFT_KEY = "sop-draft:new";
  const mut = useMutation({
    mutationFn: (payload: ReturnType<typeof valuesToBatchPayload>) => createBatch({ data: payload }),
    onSuccess: res => {
      clearPrepDraft(DRAFT_KEY);
      toast.success(`Saved ${res.rows.length} standard${res.rows.length === 1 ? "" : "s"} to log`);
      navigate({ to: "/lab-logs/standard-preparations/batch/$groupId", params: { groupId: res.batch_group_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">New Standard Preparation</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Each row in the calculator becomes its own journal line. A unique SYX ID (<span className="font-mono">{synPreviewPrefix}n</span>) is assigned per standard on save; the per-day counter is shared across all analysts.
      </p>
      <PrepForm
        defaultAnalystName={defaultAnalystName}
        submitting={mut.isPending}
        submitLabel="Create Preparation"
        draftKey={DRAFT_KEY}
        batchMode
        synPreviewPrefix={synPreviewPrefix}
        onSubmit={v => mut.mutate(valuesToBatchPayload(v, userToken))}
        onCancel={() => navigate({ to: "/lab-logs/standard-preparations" })}
      />
    </div>
  );
}
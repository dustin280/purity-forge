import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReviewConfig, updateReviewConfig } from "@/lib/review-config.functions";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/review-config")({
  component: ReviewConfigPage,
});

function ReviewConfigPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getReviewConfig);
  const setFn = useServerFn(updateReviewConfig);
  const { data } = useQuery({
    queryKey: qk.reviewConfig.get(),
    queryFn: () => getFn(),
  });

  const [allowSelfReview, setAllowSelfReview] = useState(false);

  useEffect(() => {
    if (data) setAllowSelfReview(data.allow_self_review);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (value: boolean) => setFn({ data: { allow_self_review: value } }),
    onSuccess: () => {
      toast.success("Review configuration saved");
      qc.invalidateQueries({ queryKey: qk.reviewConfig.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Result Review Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Controls the segregation-of-duties check on the Results tab.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Allow same-user signoffs</div>
            <div className="text-xs text-muted-foreground">
              Off by default: the Review button is hidden if you're the same analyst who submitted the result. Turn on to allow reviewing your own results.
            </div>
          </div>
          <Switch
            checked={allowSelfReview}
            onCheckedChange={(v) => { setAllowSelfReview(v); saveMut.mutate(v); }}
            disabled={saveMut.isPending}
          />
        </div>
      </div>
    </div>
  );
}

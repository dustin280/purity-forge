import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createStandardPreparation } from "@/lib/standard-preparations.functions";
import { PrepForm, prepValuesToPayload } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/new")({
  component: NewPrep,
});

function NewPrep() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const defaultAnalystName = profileDisplayName(profile, null);
  const create = useServerFn(createStandardPreparation);

  const mut = useMutation({
    mutationFn: (payload: ReturnType<typeof prepValuesToPayload>) => create({ data: payload }),
    onSuccess: row => {
      toast.success(`Created ${row.log_number}`);
      navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link to="/lab-logs/standard-preparations">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <h1 className="text-3xl font-bold tracking-tight mb-1">New Standard Preparation</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A unique log number (STD-PREP-YYYYMMDD-###) will be assigned automatically once saved.
      </p>
      <PrepForm
        defaultAnalystName={defaultAnalystName}
        submitting={mut.isPending}
        submitLabel="Create Preparation"
        onSubmit={v => mut.mutate(prepValuesToPayload(v))}
          onCancel={() => navigate({ to: "/lab-logs/standard-preparations" })}
      />
    </div>
  );
}
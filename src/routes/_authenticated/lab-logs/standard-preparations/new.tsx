import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Beaker, FlaskConical, Droplet } from "lucide-react";
import { toast } from "sonner";
import { createStandardPreparationBatch } from "@/lib/standard-preparations.functions";
import { PrepForm, clearPrepDraft } from "@/components/standard-preparations/prep-form";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { analystInitials, synDatePart } from "@/lib/lims-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { valuesToBatchPayload } from "@/components/standard-preparations/prep-batch-payload";
import { SolidFlow } from "@/components/standard-preparations/solid-flow/solid-flow";
import { WorkingFlow } from "@/components/standard-preparations/working-flow/working-flow";
import { AqueousFlow } from "@/components/standard-preparations/aqueous-flow/aqueous-flow";
import { StandardSetFlow } from "@/components/standard-preparations/standard-set-flow";
import { Layers } from "lucide-react";

type PrepType = "solid" | "batch" | "aqueous" | "working" | "set" | null;

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
  const [type, setType] = useState<PrepType>(null);

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
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 print:hidden"><ArrowLeft className="size-4 mr-1" /> Back</Button>
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 print:hidden">New Standard Preparation</h1>

      {!type && (
        <>
          <p className="text-sm text-muted-foreground mb-6">Choose the type of standard you're preparing.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <PickCard
              icon={<FlaskConical className="size-6" />}
              title="Primary Standard: Solid"
              desc="Guided flow — weigh a solid reference into a diluent."
              onClick={() => setType("solid")}
            />
            <PickCard
              icon={<Beaker className="size-6" />}
              title="Batch calculator"
              desc="Legacy multi-row calculator (one journal line per row)."
              onClick={() => setType("batch")}
            />
            <PickCard
              icon={<Droplet className="size-6" />}
              title="Primary Standard: Aqueous"
              desc="Liquid stock reference standard."
              onClick={() => setType("aqueous")}
            />
            <PickCard
              icon={<Beaker className="size-6" />}
              title="Working Standard"
              desc="Dilution of an existing primary standard."
              onClick={() => setType("working")}
            />
            <PickCard
              icon={<Layers className="size-6" />}
              title="Standard Set (multi-level)"
              desc="Calibration series or multi-compound blend set — one prep, N levels, prints as a label + recipe cut sheet."
              onClick={() => setType("set")}
            />
          </div>
        </>
      )}

      {type === "set" && (
        <>
          <div className="flex items-center gap-2 mb-4 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setType(null)}>
              <ArrowLeft className="size-4 mr-1" /> Change type
            </Button>
            <div className="text-sm text-muted-foreground">Standard Set (multi-level)</div>
          </div>
          <StandardSetFlow defaultAnalystName={defaultAnalystName} userToken={userToken} />
        </>
      )}

      {type === "solid" && (
        <>
          <div className="flex items-center gap-2 mb-4 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setType(null)}>
              <ArrowLeft className="size-4 mr-1" /> Change type
            </Button>
            <div className="text-sm text-muted-foreground">Primary Standard: Solid</div>
          </div>
          <SolidFlow defaultAnalystName={defaultAnalystName} userToken={userToken} />
        </>
      )}

      {type === "working" && (
        <>
          <div className="flex items-center gap-2 mb-4 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setType(null)}>
              <ArrowLeft className="size-4 mr-1" /> Change type
            </Button>
            <div className="text-sm text-muted-foreground">Working Standard</div>
          </div>
          <WorkingFlow defaultAnalystName={defaultAnalystName} userToken={userToken} />
        </>
      )}

      {type === "aqueous" && (
        <>
          <div className="flex items-center gap-2 mb-4 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => setType(null)}>
              <ArrowLeft className="size-4 mr-1" /> Change type
            </Button>
            <div className="text-sm text-muted-foreground">Primary Standard: Aqueous</div>
          </div>
          <AqueousFlow defaultAnalystName={defaultAnalystName} userToken={userToken} />
        </>
      )}

      {type === "batch" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setType(null)}>
              <ArrowLeft className="size-4 mr-1" /> Change type
            </Button>
            <div className="text-sm text-muted-foreground">Batch calculator</div>
          </div>
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
        </>
      )}
    </div>
  );
}

function PickCard({ icon, title, desc, onClick, disabled }: { icon: React.ReactNode; title: string; desc: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Card
      className={`p-5 space-y-2 transition ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50 hover:shadow-sm cursor-pointer"}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="text-primary">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
      {disabled && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Coming soon</div>}
    </Card>
  );
}
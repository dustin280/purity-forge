import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listIntakeQueue } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { VerifyDialog } from "@/components/intake/verify-dialog";
import { IntakeQueueList } from "@/components/intake/queue-list";
import type { IntakeSample } from "@/components/intake/types";

export const Route = createFileRoute("/_authenticated/intake")({ component: IntakePage });

function IntakePage() {
  const qc = useQueryClient();
  const list = useServerFn(listIntakeQueue);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.intake.list(),
    queryFn: () => list() as Promise<IntakeSample[]>,
  });

  const [verifying, setVerifying] = useState<IntakeSample | null>(null);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Intake</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Intake Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Samples staged from received Chain of Custody records. Verify each one to release it to prep.
        </p>
      </div>

      <IntakeQueueList rows={rows} isLoading={isLoading} onVerify={setVerifying} />

      <VerifyDialog
        sample={verifying}
        onOpenChange={(v) => { if (!v) setVerifying(null); }}
        onDone={() => {
          setVerifying(null);
          qc.invalidateQueries({ queryKey: qk.intake.list() });
          qc.invalidateQueries({ queryKey: qk.samples.list() });
        }}
      />
    </div>
  );
}


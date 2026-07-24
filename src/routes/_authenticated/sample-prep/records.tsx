import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";

export const Route = createFileRoute("/_authenticated/sample-prep/records")({
  head: () => ({ meta: [
    { title: "Preparation Records · Sample Prep" },
    { name: "description", content: "Historical preparation records (upcoming in Phase 1C)." },
    { property: "og:title", content: "Preparation Records" },
    { property: "og:description", content: "Historical preparation records." },
  ]}),
  component: RecordsPlaceholder,
});

function RecordsPlaceholder() {
  return (
    <SamplePrepShell title="Preparation Records" description="Traceable historical preparation records land in Phase 1C, once the New Preparation wizard is in place.">
      <Card className="p-6 text-sm text-muted-foreground">
        Each completed preparation will appear here with method revision, analyte lot, solvent lots, equipment used,
        recorded weights/volumes, calculated concentrations, and reviewer sign-off.
      </Card>
    </SamplePrepShell>
  );
}
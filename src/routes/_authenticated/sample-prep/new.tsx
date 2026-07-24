import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";

export const Route = createFileRoute("/_authenticated/sample-prep/new")({
  head: () => ({ meta: [
    { title: "New Preparation · Sample Prep" },
    { name: "description", content: "Method-driven preparation wizard (upcoming in Phase 1B)." },
    { property: "og:title", content: "New Preparation" },
    { property: "og:description", content: "Method-driven preparation wizard." },
  ]}),
  component: NewPrepPlaceholder,
});

function NewPrepPlaceholder() {
  return (
    <SamplePrepShell title="New Preparation" description="The guided method-driven preparation flow lands in Phase 1B.">
      <Card className="p-6 text-sm space-y-3">
        <p className="text-muted-foreground">
          Phase 1A ships the master data (analytes, methods and revisions, calibrations, prep rules, vessels, equipment, solvents).
          The traceable, method-driven preparation wizard — with instrument-aware volume selection, calibration-level targeting,
          and lot capture — is the next slice.
        </p>
        <p className="text-muted-foreground">Meanwhile, use Quick Dilution for one-off calculations.</p>
        <div className="flex gap-2">
          <Button asChild><Link to="/sample-prep/quick-dilution">Open Quick Dilution</Link></Button>
          <Button asChild variant="outline"><Link to="/sample-prep/methods">Manage Methods</Link></Button>
        </div>
      </Card>
    </SamplePrepShell>
  );
}
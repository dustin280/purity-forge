import { createFileRoute } from "@tanstack/react-router";
import { DilutionSession } from "@/components/sample-prep/dilution-session";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";

export const Route = createFileRoute("/_authenticated/sample-prep/quick-dilution")({
  head: () => ({
    meta: [
      { title: "Quick Dilution · Sample Prep" },
      { name: "description", content: "Fast unit-aware dilution and serial-dilution calculator with minimum pipette safeguards." },
      { property: "og:title", content: "Quick Dilution" },
      { property: "og:description", content: "Fast dilution and serial dilution calculator." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuickDilutionPage,
});

function QuickDilutionPage() {
  return (
    <SamplePrepShell title="Quick Dilution" description="Free-form dilution planner. For traceable method-driven preparation records, use New Preparation once Phase 1B ships.">
      <DilutionSession />
    </SamplePrepShell>
  );
}
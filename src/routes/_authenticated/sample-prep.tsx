import { createFileRoute } from "@tanstack/react-router";
import { DilutionCalculator } from "@/components/sample-prep/dilution-calculator";

export const Route = createFileRoute("/_authenticated/sample-prep")({
  head: () => ({
    meta: [
      { title: "Sample Prep · Dilution Calculator" },
      { name: "description", content: "Design dilutions and serial dilutions with minimum pipette safeguards." },
      { property: "og:title", content: "Sample Prep" },
      { property: "og:description", content: "Dilution and serial dilution calculator for lab prep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SamplePrepPage,
});

function SamplePrepPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sample Prep</h1>
        <p className="text-sm text-muted-foreground">
          Tools for preparing samples. Start with the dilution calculator — it auto-designs a serial dilution when a single-step aliquot would drop below 10 µL.
        </p>
      </header>
      <DilutionCalculator />
    </div>
  );
}
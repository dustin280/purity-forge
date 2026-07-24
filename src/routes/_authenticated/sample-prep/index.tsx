import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { getPrepCounts } from "@/lib/sample-prep/master-data.functions";
import { Atom, BookOpen, Droplets, TestTube2, Wrench, FlaskConical, ClipboardList, Beaker } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sample-prep/")({
  head: () => ({
    meta: [
      { title: "Sample Prep · Synthesyx LIMS" },
      { name: "description", content: "Method-driven sample preparation: analytes, methods, calibrations, equipment, and dilution planning." },
      { property: "og:title", content: "Sample Prep" },
      { property: "og:description", content: "Method-driven sample preparation module." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrepDashboard,
});

function PrepDashboard() {
  const { data } = useQuery({ queryKey: ["sp-counts"], queryFn: () => getPrepCounts() });
  const tiles = [
    { to: "/sample-prep/analytes", label: "Analytes", icon: Atom, count: data?.analytes },
    { to: "/sample-prep/methods", label: "Methods", icon: BookOpen, count: data?.methods },
    { to: "/sample-prep/solvents", label: "Solvent formulations", icon: Droplets, count: data?.solvents },
    { to: "/sample-prep/vessels", label: "Vessels", icon: TestTube2, count: data?.vessels },
    { to: "/sample-prep/equipment", label: "Equipment", icon: Wrench, count: data?.equipment },
    { to: "/sample-prep/quick-dilution", label: "Quick dilution calculator", icon: Beaker },
    { to: "/sample-prep/new", label: "New preparation (Phase 1B)", icon: FlaskConical },
    { to: "/sample-prep/records", label: "Preparation records (Phase 1C)", icon: ClipboardList },
  ] as const;
  return (
    <SamplePrepShell title="Sample Prep" description="Manage the analytes, methods, calibrations, equipment, vessels, and solvents that drive method-based sample preparation.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <Link key={t.to} to={t.to as never}>
            <Card className="hover:border-primary transition-colors h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{t.label}</CardTitle>
                  <t.icon className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {"count" in t && typeof t.count === "number" ? t.count : "—"}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </SamplePrepShell>
  );
}
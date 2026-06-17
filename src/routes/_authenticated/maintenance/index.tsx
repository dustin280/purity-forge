import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ChevronRight, Wrench, Columns3, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_authenticated/maintenance/")({ component: MaintenanceIndex });

const TILES = [
  {
    to: "/maintenance/part-picker",
    title: "Part Picker",
    desc: "Search Agilent instrument parts by module, subsystem, or part number. Live links to purchase pages.",
    icon: Wrench,
  },
  {
    to: "/maintenance/hplc-columns",
    title: "HPLC Columns",
    desc: "Browse Agilent HPLC/UHPLC columns with Agilent and eBay links. Includes an AI column-selection advisor.",
    icon: Columns3,
  },
  {
    to: "/maintenance/troubleshooting",
    title: "Troubleshooting",
    desc: "Diagnose HPLC analysis problems and instrument malfunctions with an AI expert. Upload chromatogram screenshots for diagnosis.",
    icon: Stethoscope,
  },
] as const;

function MaintenanceIndex() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Tools</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-1">Tools for maintaining lab instruments. More tools will be added here over time.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {TILES.map(t => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="p-5 border-border hover:border-primary/50 transition-colors h-full">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-md bg-muted grid place-items-center shrink-0">
                  <t.icon className="size-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{t.title}</div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
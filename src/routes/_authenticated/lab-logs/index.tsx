import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ChevronRight, PackageCheck, FlaskConical, Gauge, Beaker, Droplets, Clock, Trash2, LineChart, ClipboardCheck, TestTubes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lab-logs/")({ component: LogsIndex });

const ITEMS = [
  { to: "/material-receipts", title: "Material Receipt Log", description: "Track incoming controlled and uncontrolled materials.", icon: PackageCheck },
  { to: "/lab-logs/standard-preparations", title: "Standard Preparation Log", description: "Reference standards, system suitability, check standards, and working solutions.", icon: FlaskConical },
  { to: "/lab-logs/daily-backpressure", title: "Daily Backpressure Log", description: "Quick daily HPLC backpressure readings.", icon: Gauge },
  { to: "/lab-logs/cal-qc-trend", title: "Cal/QC Peak Trend Log", description: "Retention time and peak area drift per compound from Cal Std and QC Check injections.", icon: LineChart },
  { to: "/lab-logs/parameter-scouting", title: "Parameter Scouting Log", description: "HPLC method scouting: flow, temperature, gradient, and the compound run list.", icon: Beaker },
  { to: "/lab-logs/mobile-phase", title: "Mobile Phase Prep Log", description: "Document mobile phase A/B preparations with auto-generated step-by-step instructions.", icon: Droplets },
  { to: "/lab-logs/timesheets", title: "Timesheets", description: "Daily time tracking with project, task, duration, and CSV/PDF export.", icon: Clock },
  { to: "/lab-logs/sample-disposal", title: "Sample Disposal Log", description: "Every tracked sample location (received/instrument/dilution) and its disposal status, gated by the retention window.", icon: Trash2 },
  { to: "/lab-logs/bench-sheets", title: "Bench Sheets", description: "Record of Analysis for each run list — who ran it, prep summary per sample, observations, deviations, and review sign-off.", icon: ClipboardCheck },
  { to: "/lab-logs/analysis-batches", title: "Analysis Batches", description: "Record of Analysis for non-HPLC testing (sterility) — select samples from the queue, record media/lots, incubator(s), and inoculation details as one batch.", icon: TestTubes },
] as const;

function LogsIndex() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controlled lab records with full audit trail and PDF export.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {ITEMS.map(item => (
          <Link key={item.to} to={item.to} className="group">
            <Card className="p-5 border-border hover:border-primary/50 transition-colors h-full">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-md bg-muted grid place-items-center shrink-0">
                  <item.icon className="size-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{item.title}</div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{item.description}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
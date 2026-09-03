import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PressureLogView } from "@/components/pressure-log/pressure-log-view";

export const Route = createFileRoute("/_authenticated/lab-logs/pressure-log/")({
  component: PressureLogPage,
});

function PressureLogPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      <div className="print-hide">
        <Link to="/lab-logs">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2">
            <ArrowLeft className="size-4 mr-1" /> Back to Logs
          </Button>
        </Link>
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Instrument Pressure Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Continuous pump pressure, flow and column temperature from the live instrument feed —
            one entry per minute whenever the instrument is on, idle or running.
          </p>
        </div>
      </div>
      <PressureLogView />
    </div>
  );
}

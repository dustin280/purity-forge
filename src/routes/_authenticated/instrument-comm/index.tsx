import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatusCard } from "@/components/instrument-comm/connection-status-card";
import { Cable, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/instrument-comm/")({
  component: InstrumentCommHome,
});

function InstrumentCommHome() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Instrument Communication
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bridges between the LIMS and lab instrumentation. Browse methods, sequences,
          and connection status for each connected system.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          This is the real, synced instrument method/sequence library. For the SOP-level method
          spec (chromatography, gradient, calibration, prep rules), see{" "}
          <Link to="/sample-prep/methods" className="underline">Sample Prep → Methods</Link>.
        </p>
      </div>

      <ConnectionStatusCard />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/instrument-comm/openlab" className="block">
          <Card className="hover:border-primary/50 transition-colors h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="size-4" />
                Agilent Infinity III HPLC-DAD (OpenLab CDS)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Browse Acquisition Methods and Sequences synced from the OpenLab CDS
              project folder. Read-only in Phase 1.
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-60 h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cable className="size-4" />
              Additional instruments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            More integrations will appear here as they are wired up.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ChevronLeft } from "lucide-react";
import { ConnectionStatusCard } from "@/components/instrument-comm/connection-status-card";
import { MethodsTable } from "@/components/instrument-comm/methods-table";
import { SequencesTable } from "@/components/instrument-comm/sequences-table";
import { ReportsTable } from "@/components/instrument-comm/reports-table";
import { SettingsCard } from "@/components/instrument-comm/settings-card";

export const Route = createFileRoute("/_authenticated/instrument-comm/openlab")({
  component: OpenLabPage,
});

function OpenLabPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
      <div>
        <Link
          to="/instrument-comm"
          className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="size-3" /> Instrument Communication
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
          Agilent Infinity III HPLC-DAD
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          OpenLab CDS — read-only browser for methods and sequences.
        </p>
      </div>

      <ConnectionStatusCard />

      <Tabs defaultValue="sequences">
        <TabsList>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="methods">Methods</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="sequences" className="mt-4">
          <SequencesTable />
        </TabsContent>
        <TabsContent value="methods" className="mt-4">
          <MethodsTable />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsTable />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
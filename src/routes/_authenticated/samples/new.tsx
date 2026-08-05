import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SampleBasicFields } from "@/components/samples/basic-fields";
import { ParameterPicker } from "@/components/samples/parameter-picker";
import { useNewSampleForm } from "@/components/samples/use-new-sample-form";
export const Route = createFileRoute("/_authenticated/samples/new")({ component: NewSample });

function NewSample() {
  const { role } = useAuth();
  const f = useNewSampleForm();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Intake</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">New Sample</h1>
        <p className="text-sm text-muted-foreground mt-1">Register a specimen for HPLC-DAD analysis. A default test will be auto-assigned.</p>
      </div>
      <Card className="p-6 border-border">
        <form onSubmit={f.onSubmit} className="space-y-5">
          <SampleBasicFields
            batch={f.batch} setBatch={f.setBatch}
            clientId={f.clientId} clientName={f.clientName} setClient={f.setClient}
            project={f.project} setProject={f.setProject}
            receipt={f.receipt} setReceipt={f.setReceipt}
          />
          <ParameterPicker
            params={f.activeParams}
            selected={f.selected}
            onToggle={f.toggleParam}
            isAdmin={role === "admin"}
          />
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} value={f.notes} onChange={e => f.setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={f.busy}>{f.busy ? "Saving…" : "Register Sample"}</Button>
            <Button type="button" variant="outline" onClick={f.cancel}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
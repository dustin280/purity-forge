import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { generateBatchId } from "@/lib/lims-utils";

/**
 * Identifying fields for the New Sample form: batch ID with a regenerate
 * action, client/project, and receipt date. Kept presentational — all
 * state is owned by the parent route.
 */
export function SampleBasicFields({
  batch, setBatch, client, setClient, project, setProject, receipt, setReceipt,
}: {
  batch: string; setBatch: (v: string) => void;
  client: string; setClient: (v: string) => void;
  project: string; setProject: (v: string) => void;
  receipt: string; setReceipt: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="batch">Batch ID</Label>
        <div className="flex gap-2">
          <Input id="batch" required value={batch} onChange={e => setBatch(e.target.value)} className="font-mono" />
          <Button type="button" variant="outline" onClick={() => setBatch(generateBatchId())}>
            <Sparkles className="size-4 mr-1" />Generate
          </Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="client">Client</Label>
          <Input id="client" required value={client} onChange={e => setClient(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project">Project (optional)</Label>
          <Input id="project" value={project} onChange={e => setProject(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="receipt">Receipt Date</Label>
        <Input id="receipt" type="date" required value={receipt} onChange={e => setReceipt(e.target.value)} />
      </div>
    </>
  );
}
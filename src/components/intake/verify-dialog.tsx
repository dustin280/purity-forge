import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { verifySampleIntake, listParameters } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ClientSelect } from "@/components/samples/client-select";
import type { IntakeSample } from "./types";

/**
 * Modal that lets a tech confirm/edit the staged intake fields and release
 * a sample to prep. Owns its own form state so the parent route just toggles
 * which sample is being verified.
 */
export function VerifyDialog({ sample, onOpenChange, onDone }: {
  sample: IntakeSample | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const verify = useServerFn(verifySampleIntake);
  const listParams = useServerFn(listParameters);
  const { data: allParams = [] } = useQuery({
    queryKey: qk.testParameters.list(),
    queryFn: () => listParams(),
    enabled: !!sample,
  });
  const activeParams = (allParams as { id: string; name: string; is_active: boolean }[]).filter(p => p.is_active);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [project, setProject] = useState("");
  const [compound, setCompound] = useState("");
  const [lot, setLot] = useState("");
  const [notes, setNotes] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!sample) return;
    setClientId(sample.client_id ?? "");
    setClientName(sample.client ?? "");
    setProject(sample.project ?? "");
    setCompound(sample.compound ?? "");
    setLot(sample.lot ?? "");
    setNotes(sample.notes ?? "");
    setParams(sample.parameters ?? []);
    setFilter("");
  }, [sample]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!sample) return;
      if (!clientId) throw new Error("Select or add a client");
      await verify({ data: {
        sampleId: sample.id,
        client_id: clientId,
        project: project.trim() || null,
        compound: compound.trim(),
        lot: lot.trim() || null,
        parameters: params,
        notes: notes.trim() || null,
      } });
    },
    onSuccess: () => { toast.success("Intake verified — sample sent to prep"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to verify"),
  });

  function toggleParam(name: string) {
    setParams(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]);
  }

  const filtered = activeParams.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));
  const open = !!sample;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Verify intake {sample ? `— ${sample.batch_id}` : ""}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          className="space-y-4 py-2"
        >
          <div className="grid grid-cols-2 gap-3">
            <ClientSelect
              clientId={clientId}
              clientName={clientName}
              onSelect={(id, name) => { setClientId(id); setClientName(name); }}
            />
            <div>
              <Label className="text-xs">Project</Label>
              <Input className="mt-1" value={project} onChange={e => setProject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Compound</Label>
              <Input className="mt-1" value={compound} onChange={e => setCompound(e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Lot / Batch</Label>
              <Input className="mt-1" value={lot} onChange={e => setLot(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Requested Tests {params.length > 0 && <span className="text-muted-foreground">({params.length})</span>}</Label>
            {params.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {params.map(name => (
                  <Badge key={name} variant="secondary" className="gap-1">
                    {name}
                    <button type="button" onClick={() => toggleParam(name)} className="hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              className="h-8 mt-2"
              placeholder={`Filter ${activeParams.length} parameters…`}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border mt-2">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No parameters.</div>
              ) : filtered.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={params.includes(p.name)} onCheckedChange={() => toggleParam(p.name)} />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea className="mt-1" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Verifying…" : "Verify & send to prep"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
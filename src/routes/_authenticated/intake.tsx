import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listIntakeQueue } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, CheckCircle2 } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { VerifyDialog } from "@/components/intake/verify-dialog";
import type { IntakeSample } from "@/components/intake/types";

export const Route = createFileRoute("/_authenticated/intake")({ component: IntakePage });

function IntakePage() {
  const qc = useQueryClient();
  const list = useServerFn(listIntakeQueue);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.intake.list(),
    queryFn: () => list() as Promise<IntakeSample[]>,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, IntakeSample[]>();
    for (const r of rows) {
      const key = r.coc_id ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  const [verifying, setVerifying] = useState<IntakeSample | null>(null);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Intake</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Intake Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Samples staged from received Chain of Custody records. Verify each one to release it to prep.
        </p>
      </div>

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-8 mx-auto mb-2 opacity-40" />
            Intake queue is empty. Submit a Chain of Custody to stage new samples.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map(([cocKey, items]) => {
              const cocLabel = items[0]?.batch_id.split("-").slice(0, 2).join("-") || "Unlinked";
              return (
                <div key={cocKey} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono">{cocLabel}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {items[0]?.client} · {items.length} sample{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {items.map(s => (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-mono font-semibold">{s.batch_id}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.compound ?? "(no compound)"} {s.lot ? `· Lot ${s.lot}` : ""}
                            {s.container_size ? ` · ${s.container_size}` : ""}
                            {s.temperature_c != null ? ` · ${s.temperature_c}°C` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground hidden sm:block max-w-[40%] truncate">
                          {s.parameters?.length ? `Tests: ${s.parameters.join(", ")}` : "no tests selected"}
                        </div>
                        <Button size="sm" onClick={() => setVerifying(s)}>
                          <CheckCircle2 className="size-3.5 mr-1" /> Verify
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <VerifyDialog
        sample={verifying}
        onOpenChange={(v) => { if (!v) setVerifying(null); }}
        onDone={() => {
          setVerifying(null);
          qc.invalidateQueries({ queryKey: qk.intake.list() });
          qc.invalidateQueries({ queryKey: qk.samples.list() });
        }}
      />
    </div>
  );
}

function VerifyDialog({ sample, onOpenChange, onDone }: {
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

  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [compound, setCompound] = useState("");
  const [lot, setLot] = useState("");
  const [notes, setNotes] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!sample) return;
    setClient(sample.client ?? "");
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
      await verify({ data: {
        sampleId: sample.id,
        client: client.trim(),
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
            <div>
              <Label className="text-xs">Client</Label>
              <Input className="mt-1" value={client} onChange={e => setClient(e.target.value)} required />
            </div>
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
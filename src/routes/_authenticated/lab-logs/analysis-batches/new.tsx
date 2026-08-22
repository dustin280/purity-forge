import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { listBatchQueue, listMediaLots, createAnalysisBatch } from "@/lib/lims/analysis-batches.functions";
import { listStorageUnits } from "@/lib/storage-units.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/lab-logs/analysis-batches/new")({
  component: NewAnalysisBatch,
});

const TEST_TYPES = [{ value: "sterility", label: "Sterility (USP <71>)" }] as const;

function NewAnalysisBatch() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queueFn = useServerFn(listBatchQueue);
  const mediaLotsFn = useServerFn(listMediaLots);
  const unitsFn = useServerFn(listStorageUnits);
  const createFn = useServerFn(createAnalysisBatch);

  const [testType] = useState<string>("sterility");
  const { data: queue } = useQuery({ queryKey: qk.analysisBatches.queue(testType), queryFn: () => queueFn({ data: { testType } }) });
  const { data: ftmLots } = useQuery({ queryKey: ["media-lots", "FTM"], queryFn: () => mediaLotsFn({ data: { mediaName: "FTM" } }) });
  const { data: tsbLots } = useQuery({ queryKey: ["media-lots", "TSB"], queryFn: () => mediaLotsFn({ data: { mediaName: "TSB" } }) });
  const { data: units } = useQuery({ queryKey: qk.storageUnits.list(), queryFn: () => unitsFn() });
  const incubators = (units ?? []).filter((u) => u.unit_type === "incubator" && u.is_active);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("USP <71>");
  const [ftmReceiptId, setFtmReceiptId] = useState("");
  const [tsbReceiptId, setTsbReceiptId] = useState("");
  const [volumeMl, setVolumeMl] = useState("1.0");
  const [chosenIncubators, setChosenIncubators] = useState<Set<string>>(new Set());
  const [temps, setTemps] = useState<Record<string, string>>({});

  function toggleSample(testId: string) {
    const n = new Set(selected); if (n.has(testId)) n.delete(testId); else n.add(testId); setSelected(n);
  }
  function toggleIncubator(unitId: string) {
    const n = new Set(chosenIncubators); if (n.has(unitId)) n.delete(unitId); else n.add(unitId); setChosenIncubators(n);
  }

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        testType: "sterility",
        testIds: Array.from(selected),
        method: method.trim() || null,
        ftmReceiptId, tsbReceiptId,
        inoculationVolumeMl: Number(volumeMl) || 1.0,
        incubators: Array.from(chosenIncubators).map((unitId) => ({
          unitId, temperatureC: temps[unitId] ? Number(temps[unitId]) : null,
        })),
      },
    }),
    onSuccess: (res) => {
      if (res.failures.length) {
        toast.warning(`Batch ${res.batch.batch_number} created, but ${res.failures.length} sample(s) couldn't be placed — check tray availability.`);
      } else {
        toast.success(`Batch ${res.batch.batch_number} started`);
      }
      void navigate({ to: "/lab-logs/analysis-batches/$id", params: { id: res.batch.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = selected.size > 0 && ftmReceiptId && tsbReceiptId && chosenIncubators.size > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
      <Link to="/lab-logs/analysis-batches" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Analysis Batches
      </Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lab Records</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">New Analysis Batch</h1>
      </div>

      <Card className="p-4">
        <Label className="text-xs">Test type</Label>
        <Select value={testType} disabled>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Samples in queue ({queue?.length ?? 0})
        </h3>
        {!queue?.length ? (
          <p className="text-sm text-muted-foreground">No unbatched sterility samples right now.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(queue.map((q) => q.testId)))}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-border rounded divide-y divide-border">
              {queue.map((q) => (
                <label key={q.testId} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer text-sm">
                  <input type="checkbox" checked={selected.has(q.testId)} onChange={() => toggleSample(q.testId)} />
                  <span className="font-mono">{q.batchId}</span>
                  <span className="text-muted-foreground">{q.compound ? `· ${q.compound}` : ""} · {q.client}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Batch details</h3>
        <div className="text-sm text-muted-foreground">
          Analyst: <span className="text-foreground">{profileDisplayName(profile, user?.email)}</span> · {new Date().toLocaleString()}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Method</Label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Inoculation volume (mL, each tube)</Label>
            <Input type="number" step="0.1" min="0.1" value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">FTM lot</Label>
            <Select value={ftmReceiptId} onValueChange={setFtmReceiptId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(ftmLots ?? []).length === 0
                  ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No released FTM lots found</div>
                  : ftmLots!.map((l) => <SelectItem key={l.receiptId} value={l.receiptId}>{l.lotNumber}{l.expiryDate ? ` (exp ${l.expiryDate})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">TSB lot</Label>
            <Select value={tsbReceiptId} onValueChange={setTsbReceiptId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(tsbLots ?? []).length === 0
                  ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No released TSB lots found</div>
                  : tsbLots!.map((l) => <SelectItem key={l.receiptId} value={l.receiptId}>{l.lotNumber}{l.expiryDate ? ` (exp ${l.expiryDate})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Incubator(s) used</Label>
          {incubators.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">
              No active incubators configured — add one in <Link to="/admin/storage" className="underline">Storage & Equipment</Link>.
            </p>
          ) : (
            <div className="space-y-2 mt-1">
              {incubators.map((u) => (
                <div key={u.id} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm w-48">
                    <input type="checkbox" checked={chosenIncubators.has(u.id)} onChange={() => toggleIncubator(u.id)} />
                    {u.name}
                  </label>
                  {chosenIncubators.has(u.id) && (
                    <Input
                      type="number" step="0.1" placeholder="Temp (°C)" className="w-32 h-8"
                      value={temps[u.id] ?? ""} onChange={(e) => setTemps({ ...temps, [u.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? "Starting…" : `Start Batch (${selected.size} sample${selected.size === 1 ? "" : "s"})`}
        </Button>
      </Card>
    </div>
  );
}

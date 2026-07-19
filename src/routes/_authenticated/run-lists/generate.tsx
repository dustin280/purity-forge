import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wand2, Download, ChevronLeft } from "lucide-react";
import { listInstrumentInventory } from "@/lib/instruments-inventory.functions";
import { previewGeneratedSequences, generateAndSaveRunList } from "@/lib/run-lists/generate.functions";
import type { OptimizedSequence, SequenceRow } from "@/lib/run-lists/optimizer";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/run-lists/generate")({
  component: GenerateRunList,
});

function GenerateRunList() {
  const list = useServerFn(listInstrumentInventory);
  const preview = useServerFn(previewGeneratedSequences);
  const save = useServerFn(generateAndSaveRunList);
  const { data: instruments } = useQuery({
    queryKey: qk.instrumentInventory.list(true),
    queryFn: () => list({ data: { active_only: true } }),
  });
  const [instrumentId, setInstrumentId] = useState<string>("");
  const [injVol, setInjVol] = useState("10");
  const [sequences, setSequences] = useState<OptimizedSequence[]>([]);

  const previewMut = useMutation({
    mutationFn: () => preview({ data: { instrument_id: instrumentId } }),
    onSuccess: (r) => {
      setSequences(r.sequences);
      if (r.sequences.length === 0) toast.info(`No sequences generated (${r.sample_count} received samples).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (seq: OptimizedSequence) => save({
      data: {
        instrument_id: instrumentId,
        sequence_index: seq.index,
        injection_volume_ul: Number(injVol) || 10,
        rows: seq.rows.map((r) => ({
          type: r.type, label: r.label, sample_id: r.sample_id, vial: r.vial,
          acquisition_method: r.acquisition_method, processing_method: r.processing_method,
        })),
      },
    }),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Saved ${r.filename}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <Link to="/run-lists" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Run Lists
      </Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Instrument Worklists</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Run List Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Turn Received samples into optimized, QC-interleaved sequences. Priority order: Polar/Early → General → Hydrophobes → GLP. Max 30 samples per sequence.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-64">
          <Label className="text-xs">Instrument (active only)</Label>
          <Select value={instrumentId} onValueChange={setInstrumentId}>
            <SelectTrigger><SelectValue placeholder="Select instrument…" /></SelectTrigger>
            <SelectContent>
              {(instruments ?? []).map((it) => (
                <SelectItem key={it.id} value={it.id}>
                  {it.instrument_name ?? [it.make, it.model].filter(Boolean).join(" ") ?? "Unnamed"}
                </SelectItem>
              ))}
              {(instruments ?? []).length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">
                  No active instruments. Add one under Inventory → Instruments.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Injection volume (µL)</Label>
          <Input type="number" step="0.1" value={injVol} onChange={(e) => setInjVol(e.target.value)} className="w-28" />
        </div>
        <Button
          disabled={!instrumentId || previewMut.isPending}
          onClick={() => previewMut.mutate()}
        >
          <Wand2 className="size-4 mr-1" /> Analyze & propose
        </Button>
      </Card>

      {sequences.length === 0 && !previewMut.isPending && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Pick an instrument and click <b>Analyze & propose</b> to preview optimized sequences.
        </Card>
      )}

      {sequences.map((seq) => (
        <SequenceCard key={seq.index} seq={seq} onSave={() => saveMut.mutate(seq)} saving={saveMut.isPending} />
      ))}
    </div>
  );
}

function SequenceCard({ seq, onSave, saving }: { seq: OptimizedSequence; onSave: () => void; saving: boolean }) {
  const sampleCount = useMemo(() => seq.rows.filter((r) => r.type === "Sample").length, [seq.rows]);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{seq.name}</div>
          <div className="text-xs text-muted-foreground">
            {sampleCount} samples · {seq.rows.length} total rows{seq.temperature_c != null ? ` · ${seq.temperature_c}°C` : ""}
          </div>
        </div>
        <Button onClick={onSave} disabled={saving}>
          <Download className="size-4 mr-1" /> Generate Sequence CSV
        </Button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">#</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-left px-3 py-2">Sample / Label</th>
            <th className="text-left px-3 py-2">Method Group</th>
            <th className="text-left px-3 py-2">Vial</th>
            <th className="text-left px-3 py-2">Acq / Proc</th>
            <th className="text-left px-3 py-2">Why</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {seq.rows.map((r, i) => <SeqRow key={i} r={r} i={i + 1} />)}
        </tbody>
      </table>
    </Card>
  );
}

function SeqRow({ r, i }: { r: SequenceRow; i: number }) {
  const isQc = r.type !== "Sample";
  return (
    <tr className={isQc ? "bg-muted/20" : ""}>
      <td className="px-3 py-2 font-mono">{i}</td>
      <td className="px-3 py-2">
        <Badge variant={isQc ? "outline" : "default"}>{r.type}</Badge>
      </td>
      <td className="px-3 py-2">{r.label}</td>
      <td className="px-3 py-2">{r.method_group_name ?? "—"}</td>
      <td className="px-3 py-2 font-mono">{r.vial ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {r.acquisition_method ?? "—"}{r.processing_method ? ` / ${r.processing_method}` : ""}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{r.why}</td>
    </tr>
  );
}
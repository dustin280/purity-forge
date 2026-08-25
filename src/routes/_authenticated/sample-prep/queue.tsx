import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";
import { listPrepFlaggedSamples, type PrepFlaggedSample } from "@/lib/run-lists.functions";
import {
  generateSamplePrepForSamples, recomputeSamplePrepForSample,
  type GeneratedRow, type NeedsInputRow,
} from "@/lib/sample-prep/generate-from-queue.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/sample-prep/queue")({
  component: PrepQueuePage,
});

const NEEDS_INPUT_LABEL: Record<string, string> = {
  no_compound: "No compound recorded",
  no_calibration_data: "No calibration data available",
  no_diluent: "No diluent configured",
  missing_as_received_data: "As-received data missing or unusable",
  plan_error: "Could not compute a plan",
};

function readPendingSampleIds(): string[] | null {
  try {
    const raw = sessionStorage.getItem("prep-queue-pending");
    if (!raw) return null;
    const ids = JSON.parse(raw);
    sessionStorage.removeItem("prep-queue-pending");
    return Array.isArray(ids) && ids.length ? ids : null;
  } catch {
    return null;
  }
}

function PrepQueuePage() {
  const listFlagged = useServerFn(listPrepFlaggedSamples);
  const generate = useServerFn(generateSamplePrepForSamples);
  const recompute = useServerFn(recomputeSamplePrepForSample);

  const [sampleIds, setSampleIds] = useState<string[] | null | undefined>(undefined);
  const [created, setCreated] = useState<GeneratedRow[]>([]);
  const [needsInput, setNeedsInput] = useState<NeedsInputRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { form?: "lyophilized" | "solution"; quantity?: string; unit?: string; purity?: string }>>({});

  // Sample IDs come from the Queue's "Send to Prep" hand-off (sessionStorage,
  // same pattern as Print Labels' vial-labels-pending). Direct visits with
  // nothing pending fall back to every sample currently checked out for prep.
  const { data: flagged } = useQuery({
    queryKey: qk.runLists.prepFlagged(),
    queryFn: () => listFlagged(),
    enabled: sampleIds === null,
  });

  useEffect(() => {
    setSampleIds(readPendingSampleIds());
  }, []);

  useEffect(() => {
    if (sampleIds === null && flagged) setSampleIds(flagged.map((s: PrepFlaggedSample) => s.id));
  }, [sampleIds, flagged]);

  const genMut = useMutation({
    mutationFn: (ids: string[]) => generate({ data: { sample_ids: ids } }),
    onSuccess: (r) => {
      setCreated((prev) => [...prev.filter((c) => !r.created.some((n) => n.sample_id === c.sample_id)), ...r.created]);
      setNeedsInput(r.needsInput);
      if (!r.created.length && !r.needsInput.length) toast.info("Nothing to compute — no checked-out samples.");
      else toast.success(`${r.created.length} plan${r.created.length === 1 ? "" : "s"} computed${r.needsInput.length ? `, ${r.needsInput.length} need input` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (sampleIds && sampleIds.length) genMut.mutate(sampleIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleIds]);

  const recomputeMut = useMutation({
    mutationFn: (row: NeedsInputRow) => {
      const o = overrides[row.sample_id] ?? {};
      return recompute({
        data: {
          sample_id: row.sample_id,
          overrides: {
            received_form: o.form,
            received_quantity: o.quantity ? Number(o.quantity) : undefined,
            received_quantity_unit: o.unit,
            received_purity_percent: o.purity ? Number(o.purity) : undefined,
          },
        },
      });
    },
    onSuccess: (row) => {
      setNeedsInput((prev) => prev.filter((r) => r.sample_id !== row.sample_id));
      setCreated((prev) => [...prev, row]);
      toast.success(`${row.batch_id ?? row.compound} computed`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/queue"><ArrowLeft className="size-4 mr-1" />Back to Analysis Queue</Link></Button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Prep</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Prep Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calculated best-fit dilution for every sample you've checked out. Review, fill any gaps, and adjust
          before printing the Bench Reference cut sheet.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => sampleIds && genMut.mutate(sampleIds)} disabled={genMut.isPending || !sampleIds?.length}>
          <RefreshCw className={`size-4 mr-1 ${genMut.isPending ? "animate-spin" : ""}`} />
          {genMut.isPending ? "Computing…" : "Recompute all"}
        </Button>
      </div>

      {needsInput.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" /> {needsInput.length} sample{needsInput.length === 1 ? "" : "s"} need input
          </div>
          <div className="space-y-3">
            {needsInput.map((row) => {
              const o = overrides[row.sample_id] ?? {};
              return (
                <div key={row.sample_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="text-sm font-mono">{row.batch_id ?? row.sample_id}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {row.compound} — {NEEDS_INPUT_LABEL[row.reason] ?? row.reason}: {row.message}
                  </div>
                  {(row.reason === "missing_as_received_data" || row.reason === "plan_error") && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-40">
                        <Select value={o.form ?? ""} onValueChange={(v) => setOverrides((p) => ({ ...p, [row.sample_id]: { ...p[row.sample_id], form: v as "lyophilized" | "solution" } }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Physical form" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lyophilized">Solid / lyophilized</SelectItem>
                            <SelectItem value="solution">Solution / liquid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input className="h-8 w-24 text-xs" placeholder="Qty" value={o.quantity ?? ""} onChange={(e) => setOverrides((p) => ({ ...p, [row.sample_id]: { ...p[row.sample_id], quantity: e.target.value } }))} />
                      <Input className="h-8 w-20 text-xs" placeholder="Unit" value={o.unit ?? ""} onChange={(e) => setOverrides((p) => ({ ...p, [row.sample_id]: { ...p[row.sample_id], unit: e.target.value } }))} />
                      {o.form === "lyophilized" && (
                        <Input className="h-8 w-24 text-xs" placeholder="Purity %" value={o.purity ?? ""} onChange={(e) => setOverrides((p) => ({ ...p, [row.sample_id]: { ...p[row.sample_id], purity: e.target.value } }))} />
                      )}
                      <Button size="sm" disabled={recomputeMut.isPending} onClick={() => recomputeMut.mutate(row)}>Recompute</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Sample</th>
              <th className="text-left px-4 py-3 font-semibold">Compound</th>
              <th className="text-left px-4 py-3 font-semibold">Dilution summary</th>
              <th className="text-left px-4 py-3 font-semibold">Final conc.</th>
              <th className="text-left px-4 py-3 font-semibold">DF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {created.length === 0 && !genMut.isPending && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                {sampleIds?.length ? "No plans yet." : "No samples checked out. Select samples on the Analysis Queue and use Send to Prep."}
              </td></tr>
            )}
            {created.map((row) => (
              <tr key={row.prep_id} className="align-top hover:bg-muted/30">
                <td className="px-4 py-3 font-mono">{row.batch_id ?? row.sample_id}</td>
                <td className="px-4 py-3">
                  {row.compound}
                  {row.warnings.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-amber-600">{row.warnings.length} warning{row.warnings.length === 1 ? "" : "s"}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ol className="text-xs space-y-1 pl-4 list-decimal">
                    {row.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">
                  {row.targetConcentrationMgPerMl.toPrecision(4)} mg/mL
                  {row.calibrationLevel != null && <div className="text-[10px] text-muted-foreground font-normal">Level {row.calibrationLevel}</div>}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {row.totalDilutionFactor != null ? `${row.totalDilutionFactor.toPrecision(3)}×` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Bench Reference cut sheet printing and multi-step dilution editing land next — this page currently
        auto-computes and persists a plan per sample (visible in Sample Prep → Records).
      </p>
    </div>
  );
}

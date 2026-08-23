import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, CheckCircle2, Printer, AlertTriangle } from "lucide-react";
import { getRunList } from "@/lib/run-lists.functions";
import {
  generateSamplePrepForRunList, recomputeSamplePrepForItem,
  type GeneratedRow, type NeedsInputRow,
} from "@/lib/sample-prep/generate-from-run-list.functions";
import { acceptSamplePrep } from "@/lib/sample-prep/accept.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/run-lists/$id_/prep")({
  component: RunListPrepPage,
});

const NEEDS_INPUT_LABEL: Record<string, string> = {
  no_compound: "No compound recorded",
  no_calibration_data: "No calibration data available",
  no_diluent: "No diluent configured",
  missing_as_received_data: "As-received data missing or unusable",
  plan_error: "Could not compute a plan",
};

function RunListPrepPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getRunList);
  const generate = useServerFn(generateSamplePrepForRunList);
  const recompute = useServerFn(recomputeSamplePrepForItem);
  const accept = useServerFn(acceptSamplePrep);

  const { data: runListData } = useQuery({ queryKey: qk.runLists.detail(id), queryFn: () => get({ data: { id } }) });

  const [created, setCreated] = useState<GeneratedRow[]>([]);
  const [needsInput, setNeedsInput] = useState<NeedsInputRow[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, { form?: "lyophilized" | "solution"; quantity?: string; unit?: string; purity?: string }>>({});

  const genMut = useMutation({
    mutationFn: () => generate({ data: { run_list_id: id } }),
    onSuccess: (r) => {
      setCreated(prev => [...prev.filter(c => !r.created.some(n => n.run_list_item_id === c.run_list_item_id)), ...r.created]);
      setNeedsInput(r.needsInput);
      if (!r.created.length && !r.needsInput.length) toast.info("Nothing to generate — all samples already have a linked prep.");
      else toast.success(`${r.created.length} plan${r.created.length === 1 ? "" : "s"} computed${r.needsInput.length ? `, ${r.needsInput.length} need input` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => { genMut.mutate(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  const recomputeMut = useMutation({
    mutationFn: (row: NeedsInputRow) => {
      const o = overrides[row.run_list_item_id] ?? {};
      return recompute({
        data: {
          run_list_item_id: row.run_list_item_id,
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
      setNeedsInput(prev => prev.filter(r => r.run_list_item_id !== row.run_list_item_id));
      setCreated(prev => [...prev, row]);
      toast.success(`${row.batch_id ?? row.compound} computed`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptMut = useMutation({
    mutationFn: (row: GeneratedRow) => accept({ data: { prep_id: row.prep_id } }),
    onSuccess: (_r, row) => {
      setAccepted(prev => new Set(prev).add(row.prep_id));
      toast.success(`${row.batch_id ?? row.compound} accepted — saved to Drive`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const readyToAccept = useMemo(
    () => created.filter(r => !accepted.has(r.prep_id) && r.warnings.length === 0),
    [created, accepted],
  );

  async function acceptAllReady() {
    for (const row of readyToAccept) {
      // eslint-disable-next-line no-await-in-loop
      await acceptMut.mutateAsync(row);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm"><Link to="/run-lists/$id" params={{ id }}><ArrowLeft className="size-4 mr-1" />Back to run list</Link></Button>
      </div>

      <div className="print:hidden">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample Prep</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{runListData?.list?.name ?? "Run list"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Computed dilution plans for every sample on this run list. Review, fill gaps, and accept — accepting
          builds the controlled document and pushes it to the LM-SamplePrep Drive folder.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          <RefreshCw className={`size-4 mr-1 ${genMut.isPending ? "animate-spin" : ""}`} />
          {genMut.isPending ? "Generating…" : "Regenerate"}
        </Button>
        <Button size="sm" disabled={readyToAccept.length === 0 || acceptMut.isPending} onClick={acceptAllReady}>
          <CheckCircle2 className="size-4 mr-1" /> Accept all ready ({readyToAccept.length})
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.print()} disabled={created.length === 0}>
          <Printer className="size-4 mr-1" /> Print working copy
        </Button>
      </div>

      {needsInput.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 space-y-3 print:hidden">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" /> {needsInput.length} sample{needsInput.length === 1 ? "" : "s"} need input
          </div>
          <div className="space-y-3">
            {needsInput.map(row => {
              const o = overrides[row.run_list_item_id] ?? {};
              return (
                <div key={row.run_list_item_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="text-sm font-mono">{row.batch_id ?? row.sample_id}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {row.compound} — {NEEDS_INPUT_LABEL[row.reason] ?? row.reason}: {row.message}
                  </div>
                  {(row.reason === "missing_as_received_data" || row.reason === "plan_error") && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-40">
                        <Select value={o.form ?? ""} onValueChange={(v) => setOverrides(p => ({ ...p, [row.run_list_item_id]: { ...p[row.run_list_item_id], form: v as "lyophilized" | "solution" } }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Physical form" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lyophilized">Solid / lyophilized</SelectItem>
                            <SelectItem value="solution">Solution / liquid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input className="h-8 w-24 text-xs" placeholder="Qty" value={o.quantity ?? ""} onChange={e => setOverrides(p => ({ ...p, [row.run_list_item_id]: { ...p[row.run_list_item_id], quantity: e.target.value } }))} />
                      <Input className="h-8 w-20 text-xs" placeholder="Unit" value={o.unit ?? ""} onChange={e => setOverrides(p => ({ ...p, [row.run_list_item_id]: { ...p[row.run_list_item_id], unit: e.target.value } }))} />
                      {o.form === "lyophilized" && (
                        <Input className="h-8 w-24 text-xs" placeholder="Purity %" value={o.purity ?? ""} onChange={e => setOverrides(p => ({ ...p, [row.run_list_item_id]: { ...p[row.run_list_item_id], purity: e.target.value } }))} />
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

      <div className="hidden print:block mb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Working copy — not a controlled document</div>
        <h1 className="text-xl font-bold">{runListData?.list?.name ?? "Run list"} — Sample Prep</h1>
        <div className="text-xs text-muted-foreground">Printed {new Date().toLocaleString()}</div>
      </div>

      <div className="space-y-3">
        {created.map(row => {
          const isAccepted = accepted.has(row.prep_id);
          return (
            <Card key={row.prep_id} className="p-4 space-y-2 break-inside-avoid">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-mono">{row.batch_id ?? row.sample_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.compound} · Target {row.targetConcentrationMgPerMl.toPrecision(4)} mg/mL{row.calibrationLevel != null ? ` (Level ${row.calibrationLevel})` : ""} · {row.prep_number}
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  {row.warnings.length > 0 && <Badge variant="secondary" className="text-amber-600">{row.warnings.length} warning{row.warnings.length === 1 ? "" : "s"}</Badge>}
                  {isAccepted ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Accepted</Badge>
                  ) : (
                    <Button size="sm" disabled={acceptMut.isPending} onClick={() => acceptMut.mutate(row)}>Accept</Button>
                  )}
                </div>
              </div>
              {row.warnings.length > 0 && (
                <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-5 print:hidden">
                  {row.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <ol className="text-xs space-y-1 pl-4 list-decimal">
                {row.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </Card>
          );
        })}
        {created.length === 0 && !genMut.isPending && needsInput.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8 print:hidden">No samples to prepare on this run list.</div>
        )}
      </div>
    </div>
  );
}

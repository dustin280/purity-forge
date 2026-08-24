import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Wand2, Download, ChevronLeft, CloudUpload, Tags, AlertTriangle, FlaskConical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listInstrumentInventory } from "@/lib/instruments-inventory.functions";
import { previewGeneratedSequences, generateAndSaveRunList, pushGeneratedRunListToDrive, getSampleLabelFields } from "@/lib/run-lists/generate.functions";
import { generateRunListCsv } from "@/lib/run-lists.functions";
import type { OptimizedSequence, SequenceRow } from "@/lib/run-lists/optimizer";
import { StandardPicker, type PickedStandard } from "@/components/standard-preparations/standard-picker";
import { qk } from "@/lib/query-keys";
import { NoVialsDialog } from "@/components/run-lists/no-vials-dialog";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";

export const Route = createFileRoute("/_authenticated/run-lists/generate")({
  component: GenerateRunList,
});

function GenerateRunList() {
  const list = useServerFn(listInstrumentInventory);
  const preview = useServerFn(previewGeneratedSequences);
  const save = useServerFn(generateAndSaveRunList);
  const push = useServerFn(pushGeneratedRunListToDrive);
  const labelFields = useServerFn(getSampleLabelFields);
  const rebuildCsv = useServerFn(generateRunListCsv);
  const navigate = useNavigate();
  const signalWorkflowEvent = useWorkflowSignal();
  const { data: instruments } = useQuery({
    queryKey: qk.instrumentInventory.list(true),
    queryFn: () => list({ data: { active_only: true } }),
  });
  const [instrumentId, setInstrumentId] = useState<string>("");
  const [sequences, setSequences] = useState<OptimizedSequence[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set([1]));
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState<number | "bulk" | null>(null);
  const [noVialsOpen, setNoVialsOpen] = useState(false);
  // Multiple buttons (Download, Push, per-card Save) can all trigger a
  // "save" for the same sequence -- clicking more than one of them used to
  // create a brand new run_lists row (and a fresh, duplicate vial
  // reservation for every sample on it) each time. Once a sequence index
  // has been saved once, every subsequent action reuses that run_list_id
  // instead of creating another. Ref alongside state so a rapid second
  // click sees the just-saved id synchronously, before React re-renders.
  const savedRunListIdsRef = useRef<Record<number, string>>({});
  const [savedRunListIds, setSavedRunListIds] = useState<Record<number, string>>({});

  const previewMut = useMutation({
    mutationFn: () => preview({ data: { instrument_id: instrumentId } }),
    onSuccess: (r) => {
      setSequences(r.sequences);
      savedRunListIdsRef.current = {};
      setSavedRunListIds({});
      setSelected(new Set(r.sequences.length ? [r.sequences[0].index] : []));
      if (r.sequences.length === 0) toast.info(`No sequences generated (${r.sample_count} pre-analysis samples).`);
      const outOfVials = r.sequences.some((seq) =>
        seq.rows.some((row) => row.type === "Sample" && row.vial === null),
      );
      if (outOfVials && !r.tray_configured) {
        toast.error("This instrument has no tray configured — assign one in Inventory → Instruments before generating.");
      } else if (outOfVials) {
        setNoVialsOpen(true);
      }
      signalWorkflowEvent("samples-selected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadCsv = (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const injectionVolumeForServer = "method" as const;

  const buildSaveArgs = (seq: OptimizedSequence) => ({
    instrument_id: instrumentId,
    sequence_index: seq.index,
    injection_volume_ul: injectionVolumeForServer,
    rows: seq.rows.map((row) => ({
      type: row.type, label: row.label, sample_id: row.sample_id, lot: row.lot, vial: row.vial,
      acquisition_method: row.acquisition_method, processing_method: row.processing_method,
      level: row.level, standard_prep_id: row.standard_prep_id ?? null,
    })),
  });

  /** Creates the run list on first call for a given sequence index; every
   *  later call (from any button) reuses that run_list_id and just rebuilds
   *  the CSV from current DB state instead of inserting a duplicate. */
  async function saveOnce(seq: OptimizedSequence): Promise<{ run_list_id: string; filename: string; csv: string }> {
    const existingId = savedRunListIdsRef.current[seq.index];
    if (existingId) {
      const r = await rebuildCsv({ data: { run_list_id: existingId, persist: false } });
      return { run_list_id: existingId, filename: r.filename, csv: r.csv };
    }
    const r = await save({ data: buildSaveArgs(seq) });
    savedRunListIdsRef.current = { ...savedRunListIdsRef.current, [seq.index]: r.run_list_id };
    setSavedRunListIds(savedRunListIdsRef.current);
    return r;
  }

  const saveMut = useMutation({
    mutationFn: (seq: OptimizedSequence) => saveOnce(seq),
    onSuccess: (r) => {
      downloadCsv(r.filename, r.csv);
      toast.success(`Saved ${r.filename}`);
      signalWorkflowEvent("run-list-saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushOne = async (seq: OptimizedSequence) => {
    setPushBusy(seq.index);
    try {
      const r = await saveOnce(seq);
      const p = await push({
        data: {
          run_list_id: r.run_list_id,
          filename: r.filename,
          csv: r.csv,
          instrument_id: instrumentId,
        },
      });
      toast.success(`Pushed ${p.drive_file_name} to Google Drive`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushBusy(null);
    }
  };

  const pushSelected = async () => {
    setPushBusy("bulk");
    try {
      for (const seq of visibleSequences) {
        const r = await saveOnce(seq);
        await push({
          data: {
            run_list_id: r.run_list_id,
            filename: r.filename,
            csv: r.csv,
            instrument_id: instrumentId,
          },
        });
      }
      toast.success(`Pushed ${visibleSequences.length} sequence${visibleSequences.length === 1 ? "" : "s"} to Google Drive`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushBusy(null);
    }
  };

  const updateRowStandard = (seqIndex: number, rowIndex: number, picked: PickedStandard | null) => {
    setSequences((prev) => prev.map((seq) => seq.index !== seqIndex ? seq : {
      ...seq,
      rows: seq.rows.map((row, ri) => ri !== rowIndex ? row : {
        ...row,
        standard_prep_id: picked?.id ?? null,
        standard_label: picked ? (picked.log_number ?? picked.standard_name) : null,
      }),
    }));
  };

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const visibleSequences = sequences.filter((s) => selected.has(s.index));

  const sampleRows = sequences.flatMap((s) => s.rows.filter((r) => r.type === "Sample"));
  const warnedRows = sampleRows.filter((r) => r.prep_warning);

  const printLabels = async (seqs: OptimizedSequence[]) => {
    const rows = seqs.flatMap((s) => s.rows);
    if (rows.length === 0) {
      toast.info("No rows to label in the selected sequence(s).");
      return;
    }
    const sampleIds = [...new Set(rows.map((r) => r.sample_id).filter((id): id is string => !!id))];
    let fieldsById = new Map<string, { compound: string | null; label_content_value: number | null; label_content_unit: string | null }>();
    try {
      const fields = sampleIds.length ? await labelFields({ data: { sample_ids: sampleIds } }) : [];
      fieldsById = new Map(fields.map((f) => [f.id, f] as const));
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const lines = rows.map((r) => {
      const idPart = r.label.split("—")[0].trim() || r.label;
      const f = r.sample_id ? fieldsById.get(r.sample_id) : undefined;
      const compoundPart = f?.compound ? ` / ${f.compound}` : "";
      const amountPart = f?.label_content_value != null ? ` / ${f.label_content_value}${f.label_content_unit ?? ""}` : "";
      const lotPart = r.lot ? ` / Lot ${r.lot}` : "";
      const vialPart = r.vial ? ` / ${r.vial}` : "";
      return `${idPart}${compoundPart}${amountPart}${lotPart}${vialPart}`;
    });
    try {
      sessionStorage.setItem("vial-labels-pending", lines.join("\n"));
      sessionStorage.setItem("vial-labels-return-to", `${window.location.pathname}${window.location.search}`);
    } catch { /* ignore */ }
    void navigate({ to: "/vial-labels" });
  };

  const downloadSelected = async () => {
    setBulkBusy(true);
    try {
      for (const seq of visibleSequences) {
        const r = await saveOnce(seq);
        downloadCsv(r.filename, r.csv);
      }
      toast.success(`Saved ${visibleSequences.length} sequence${visibleSequences.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <Link to="/run-lists" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3" /> Run Lists
      </Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Instrument Worklists</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Run List Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Turn pre-analysis samples (received, intake verified, scheduled, prep, in progress) into optimized, QC-interleaved sequences. Priority order: Polar/Early → General → Hydrophobes → GLP. Max 30 samples per sequence.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-64">
          <Label className="text-xs">Instrument (active only)</Label>
          <Select
            value={instrumentId}
            onValueChange={(v) => { setInstrumentId(v); signalWorkflowEvent("instrument-picked"); }}
          >
            <SelectTrigger data-guide="generate-instrument"><SelectValue placeholder="Select instrument…" /></SelectTrigger>
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
        <Button
          disabled={!instrumentId || previewMut.isPending}
          onClick={() => previewMut.mutate()}
          data-guide="generate-analyze"
        >
          <Wand2 className="size-4 mr-1" /> Select Samples
        </Button>
      </Card>

      {sequences.length === 0 && !previewMut.isPending && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Pick an instrument and click <b>Select Samples</b> to preview optimized sequences.
        </Card>
      )}

      {sampleRows.length > 0 && (() => {
        if (warnedRows.length === 0) {
          return (
            <div className="text-xs rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center gap-2">
              <FlaskConical className="size-3.5" />
              All {sampleRows.length} sample rows have an approved, unexpired preparation record.
            </div>
          );
        }
        const byReason = warnedRows.reduce<Record<string, string[]>>((acc, r) => {
          const key = r.prep_warning ?? "unknown";
          const label = r.label.split(" — ")[0] || r.label;
          (acc[key] ||= []).push(label);
          return acc;
        }, {});
        const labelFor = (k: string) => ({
          no_prep: "No prep record found",
          not_approved: "Prep not yet approved",
          expired: "Prep expired",
        }[k] ?? k);
        return (
          <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-3.5" />
              {warnedRows.length} of {sampleRows.length} sample rows have preparation warnings (export allowed).
            </div>
            <ul className="pl-5 list-disc space-y-0.5">
              {Object.entries(byReason).map(([k, xs]) => (
                <li key={k}>
                  <span className="font-medium">{labelFor(k)}:</span>{" "}
                  {Array.from(new Set(xs)).slice(0, 8).join(", ")}
                  {xs.length > 8 ? ` +${xs.length - 8} more` : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {sequences.length > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Show:</span>
          {sequences.map((seq) => {
            const active = selected.has(seq.index);
            const sampleCount = seq.rows.filter((r) => r.type === "Sample").length;
            return (
              <button
                key={seq.index}
                type="button"
                onClick={() => toggle(seq.index)}
                className={cn(
                  "px-3 py-1.5 rounded-md border text-xs transition-colors text-left",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border text-muted-foreground",
                )}
              >
                <div className="font-medium">Seq {seq.index}</div>
                <div className="text-[10px] opacity-80">{sampleCount} samples</div>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set(sequences.map((s) => s.index)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Select none
            </button>
            {visibleSequences.length > 1 && (
              <Button size="sm" onClick={downloadSelected} disabled={bulkBusy}>
                <Download className="size-4 mr-1" /> Download selected ({visibleSequences.length})
              </Button>
            )}
            {visibleSequences.length >= 1 && (
              <Button size="sm" variant="secondary" onClick={pushSelected} disabled={pushBusy !== null}>
                <CloudUpload className="size-4 mr-1" /> Push {visibleSequences.length > 1 ? `${visibleSequences.length} ` : ""}to Drive
              </Button>
            )}
            {visibleSequences.length >= 1 && (
              <Button size="sm" variant="secondary" onClick={() => printLabels(visibleSequences)}>
                <Tags className="size-4 mr-1" /> Print Labels
              </Button>
            )}
            {Object.keys(savedRunListIds).length > 0 && (
              <Button asChild size="sm" variant="default">
                {Object.keys(savedRunListIds).length === 1 ? (
                  <Link to="/run-lists/$id" params={{ id: Object.values(savedRunListIds)[0] }}>
                    <FlaskConical className="size-4 mr-1" /> Open run list →
                  </Link>
                ) : (
                  <Link to="/run-lists">
                    <FlaskConical className="size-4 mr-1" /> Open saved run lists ({Object.keys(savedRunListIds).length}) →
                  </Link>
                )}
              </Button>
            )}
          </div>
        </Card>
      )}

      {visibleSequences.map((seq) => (
        <SequenceCard
          key={seq.index}
          seq={seq}
          onSave={() => saveMut.mutate(seq)}
          saving={saveMut.isPending}
          onPush={() => pushOne(seq)}
          pushing={pushBusy === seq.index}
          onPrintLabels={() => printLabels([seq])}
          onPickStandard={(rowIndex, picked) => updateRowStandard(seq.index, rowIndex, picked)}
        />
      ))}

      {sequences.length > 0 && visibleSequences.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">
          No sequences selected. Pick one above to preview and export.
        </Card>
      )}

      <NoVialsDialog
        open={noVialsOpen}
        onOpenChange={setNoVialsOpen}
        onReleased={() => previewMut.mutate()}
      />
    </div>
  );
}

function SequenceCard({ seq, onSave, saving, onPush, pushing, onPrintLabels, onPickStandard }: {
  seq: OptimizedSequence; onSave: () => void; saving: boolean;
  onPush: () => void; pushing: boolean; onPrintLabels: () => void;
  onPickStandard: (rowIndex: number, picked: PickedStandard | null) => void;
}) {
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSave} disabled={saving} data-guide="generate-save">
            <Download className="size-4 mr-1" /> Generate CSV
          </Button>
          <Button onClick={onPush} disabled={pushing}>
            <CloudUpload className="size-4 mr-1" /> {pushing ? "Pushing…" : "Push to Drive"}
          </Button>
          <Button variant="outline" onClick={onPrintLabels}>
            <Tags className="size-4 mr-1" /> Print Labels
          </Button>
        </div>
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
            <th className="text-left px-3 py-2">Standard</th>
            <th className="text-left px-3 py-2">Why</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {seq.rows.map((r, i) => (
            <SeqRow key={i} r={r} i={i + 1} onPickStandard={(picked) => onPickStandard(i, picked)} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SeqRow({ r, i, onPickStandard }: { r: SequenceRow; i: number; onPickStandard: (picked: PickedStandard | null) => void }) {
  const isQc = r.type !== "Sample";
  const [open, setOpen] = useState(false);
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
      <td className="px-3 py-2">
        {isQc ? (
          <div className="flex items-center gap-1">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "text-xs px-2 py-1 rounded border transition-colors",
                    r.standard_label ? "border-primary/40 text-primary" : "border-dashed border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.standard_label ?? "Pick standard"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96" align="start">
                <StandardPicker onPick={(s) => { onPickStandard(s); setOpen(false); }} />
              </PopoverContent>
            </Popover>
            {r.standard_label && (
              <button type="button" onClick={() => onPickStandard(null)} className="text-muted-foreground hover:text-destructive">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{r.why}</td>
    </tr>
  );
}
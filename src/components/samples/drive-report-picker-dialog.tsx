/**
 * Lets an analyst browse the "LM-Reports Complete" Drive folder, pick a
 * completed instrument report PDF, and preview the auto-parsed compound
 * results before importing them into the Results form. Parsing is
 * best-effort (see drive-reports.functions.ts) — the analyst reviews the
 * preview before anything is used, nothing here saves on its own.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { listReportFiles, parseReportFile, compoundsToPeaks, type ParsedReport } from "@/lib/results/drive-reports.functions";
import type { Peak } from "@/lib/lims-utils";

export type ImportedResult = {
  peaks: Peak[];
  purity: number;
  raw_data_file_path: string;
  file_name: string;
  sample_id_in_report: string | null;
  analysis_date: string | null;
};

export function DriveReportPickerDialog({
  open, onOpenChange, batchId, onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batchId: string;
  onImport: (result: ImportedResult) => void;
}) {
  const listFn = useServerFn(listReportFiles);
  const parseFn = useServerFn(parseReportFile);
  const [q, setQ] = useState("");
  const [parsed, setParsed] = useState<ParsedReport | null>(null);

  const { data: files = [], isLoading, error } = useQuery({
    queryKey: ["lm-reports-complete-files"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const parseMut = useMutation({
    mutationFn: (f: { id: string; name: string }) => parseFn({ data: { file_id: f.id, file_name: f.name } }),
    onSuccess: (r) => setParsed(r as ParsedReport),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () => files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
    [files, q],
  );

  function reset() {
    setParsed(null);
    setQ("");
  }

  function useThisReport() {
    if (!parsed) return;
    const compoundsWithData = parsed.compounds.filter((c) => c.purity_pct != null || c.amount_per_vial_mg != null);
    if (compoundsWithData.length === 0) {
      toast.error("No compound results could be parsed from this report — try another file or enter results manually.");
      return;
    }
    const { peaks, purity } = compoundsToPeaks(parsed.compounds);
    onImport({
      peaks, purity,
      raw_data_file_path: `https://drive.google.com/file/d/${parsed.file_id}/view`,
      file_name: parsed.file_name, sample_id_in_report: parsed.sample_id_in_report,
      analysis_date: parsed.analysis_date,
    });
    onOpenChange(false);
    reset();
  }

  const sampleIdLooksRelated = parsed?.sample_id_in_report
    ? parsed.sample_id_in_report.toLowerCase().includes(batchId.toLowerCase())
    : false;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from LM-Reports Complete</DialogTitle>
          <DialogDescription className="sr-only">Pick a completed instrument report PDF to auto-fill this result</DialogDescription>
        </DialogHeader>

        {!parsed && (
          <div className="space-y-3">
            <Input placeholder="Search report filename…" value={q} onChange={(e) => setQ(e.target.value)} />
            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            {isLoading && <p className="text-sm text-muted-foreground">Loading reports…</p>}
            <div className="max-h-96 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {filtered.length === 0 && !isLoading && (
                <div className="p-4 text-sm text-muted-foreground">No matching report files.</div>
              )}
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={parseMut.isPending}
                  onClick={() => parseMut.mutate({ id: f.id, name: f.name })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
                >
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  {f.modified_time && (
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(f.modified_time).toLocaleDateString()}</span>
                  )}
                </button>
              ))}
            </div>
            {parseMut.isPending && <p className="text-sm text-muted-foreground">Parsing report…</p>}
          </div>
        )}

        {parsed && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                {sampleIdLooksRelated ? (
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-400 shrink-0" />
                )}
                <span className="font-medium truncate">{parsed.sample_id_in_report ?? "Sample ID not found in report"}</span>
              </div>
              {!sampleIdLooksRelated && (
                <p className="text-xs text-amber-400">
                  This doesn't obviously match {batchId} — double-check you picked the right file before importing.
                </p>
              )}
              <div className="text-xs text-muted-foreground">
                Analysis date: {parsed.analysis_date ?? "—"}
                {parsed.total_peptide_contents_mg != null && ` · Total peptide contents: ${parsed.total_peptide_contents_mg} mg/vial`}
              </div>
            </div>

            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Compound</th>
                  <th className="text-right px-2 py-1.5">RT</th>
                  <th className="text-right px-2 py-1.5">Amount/Vial</th>
                  <th className="text-right px-2 py-1.5">%Label Claim</th>
                  <th className="text-right px-2 py-1.5">Purity %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.compounds.map((c, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{c.compound}</td>
                    <td className="px-2 py-1.5 text-right">{c.rt.toFixed(3)}</td>
                    <td className="px-2 py-1.5 text-right">{c.amount_per_vial_mg ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{c.percent_label_claim ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{c.purity_pct ?? "—"}</td>
                  </tr>
                ))}
                {parsed.compounds.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">No compound rows parsed.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground">
              Auto-parsed from the PDF — review against the report before importing. Purity % is taken as the result's purity.
            </p>
          </div>
        )}

        <DialogFooter>
          {parsed ? (
            <>
              <Button variant="outline" onClick={() => setParsed(null)}>Back to file list</Button>
              <Button onClick={useThisReport}>Use this data</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

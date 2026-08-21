import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Chromatogram } from "@/components/lims/chromatogram";
import { fmtPct, type Peak } from "@/lib/lims-utils";
import { purityVerdict, type SpecRange } from "@/lib/lims/spec-verdict";
import { CloudDownload, X } from "lucide-react";
import { DriveReportPickerDialog, type ImportedResult } from "./drive-report-picker-dialog";
import { parsePeaks } from "@/lib/parse-peaks";
import type { CalibrationData } from "@/lib/results/drive-reports.functions";
import { NonConformityButton } from "./non-conformity-button";

type LatestResult = {
  id: string;
  purity_percentage: number | null;
  analysis_date: string;
  analyst_id: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  chromatogram_image: string | null;
  calibration_image: string | null;
  calibration_data: CalibrationData | null;
  raw_data_file_path: string | null;
  uv_conf_match: number | null;
  wavelength_nm: number | null;
  report_metadata: Record<string, string> | null;
} | null;

export function ResultsTab({
  latestResult,
  peaks,
  pasted,
  setPasted,
  onSubmit,
  busy,
  spec,
  currentUserId,
  onReview,
  onApprove,
  batchId,
  purityWaived,
  waivedByName,
  waivedAt,
  onWaivePurity,
  sampleId,
  compoundId,
  compoundName,
  actorName,
}: {
  latestResult: LatestResult;
  peaks: Peak[];
  pasted: string;
  setPasted: (v: string) => void;
  onSubmit: (imported?: {
    peaks: Peak[]; purity: number; raw_data_file_path: string | null; analysis_date: string | null;
    chromatogram_image: string | null; calibration_image: string | null; calibration_data: CalibrationData | null;
    uv_conf_match: number | null; wavelength_nm: number | null;
    report_metadata: Record<string, string> | null;
  }) => void;
  busy: boolean;
  spec: SpecRange;
  currentUserId: string | null;
  onReview: (resultId: string) => void;
  onApprove: (resultId: string) => void;
  batchId: string;
  purityWaived: boolean;
  waivedByName: string | null;
  waivedAt: string | null;
  onWaivePurity: (waived: boolean) => void;
  sampleId: string;
  compoundId: string | null;
  compoundName: string | null;
  actorName: string;
}) {
  const verdict = latestResult ? purityVerdict(latestResult.purity_percentage, spec) : null;
  const verdictColor = verdict === "pass" ? "var(--status-success)" : verdict === "fail" ? "var(--destructive)" : "var(--muted-foreground)";
  const canReview = !!latestResult && !latestResult.reviewed_at && latestResult.analyst_id !== currentUserId;
  const canApprove = !!latestResult && !!latestResult.reviewed_at && !latestResult.approved_at;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [imported, setImported] = useState<ImportedResult | null>(null);

  const pastedLineCount = pasted.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length;
  const pastedPeakCount = pasted.trim() ? parsePeaks(pasted).peaks.length : 0;
  const pastedFailedCount = Math.max(0, pastedLineCount - pastedPeakCount);

  function handleSubmit() {
    if (imported) {
      onSubmit({
        peaks: imported.peaks, purity: imported.purity,
        raw_data_file_path: imported.raw_data_file_path, analysis_date: imported.analysis_date,
        chromatogram_image: imported.chromatogram_image,
        calibration_image: imported.calibration_image, calibration_data: imported.calibration_data,
        uv_conf_match: imported.uv_conf_match, wavelength_nm: imported.wavelength_nm,
        report_metadata: imported.report_metadata,
      });
    } else {
      onSubmit();
    }
  }

  return (
    <div className="space-y-4">
      {peaks.length > 0 && (
        <div className="flex justify-end">
          <NonConformityButton
            sampleId={sampleId}
            resultId={latestResult?.id ?? null}
            compoundId={compoundId}
            compoundName={compoundName}
            peaks={peaks.map(p => ({
              peak_id: p.peak_id, rt: p.rt, area_pct: p.area_pct,
              peak_purity: p.peak_purity, peak_purity_passed: p.peak_purity_passed, uv_match: p.uv_match,
            }))}
            actorName={actorName}
          />
        </div>
      )}
      {latestResult && (
        <Card className="border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Latest Purity</div>
              <div className="text-3xl font-mono font-bold" style={{ color: verdictColor }}>
                {fmtPct(latestResult.purity_percentage)}
              </div>
              <div className="text-xs mt-1" style={{ color: verdictColor }}>
                {verdict === "pass" ? "PASS" : verdict === "fail" ? "FAIL" : "No spec on file"}
              </div>
            </div>
            <div className="text-right space-y-2">
              <div className="text-xs text-muted-foreground font-mono">
                {new Date(latestResult.analysis_date).toLocaleString()}
              </div>
              {(latestResult.uv_conf_match != null || latestResult.wavelength_nm != null) && (
                <div className="text-xs text-muted-foreground font-mono">
                  {latestResult.uv_conf_match != null && `UV match ${latestResult.uv_conf_match}`}
                  {latestResult.uv_conf_match != null && latestResult.wavelength_nm != null && " · "}
                  {latestResult.wavelength_nm != null && `λ ${latestResult.wavelength_nm} nm`}
                </div>
              )}
              {latestResult.raw_data_file_path && (
                <a href={latestResult.raw_data_file_path} target="_blank" rel="noreferrer"
                  className="text-xs text-primary hover:underline block">Source report</a>
              )}
              <div className="flex gap-1.5 justify-end">
                {canReview && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onReview(latestResult.id)}
                    className="bg-[#ff2d95] hover:bg-[#ff54ab] text-white border-0 font-bold animate-pulse shadow-[0_0_18px_5px_rgba(255,45,149,0.9)] hover:shadow-[0_0_26px_9px_rgba(255,45,149,1)]"
                  >
                    Review
                  </Button>
                )}
                {canApprove && (
                  <Button size="sm" disabled={busy} onClick={() => onApprove(latestResult.id)} data-guide="results-approve">Approve</Button>
                )}
                {latestResult.approved_at && (
                  <span className="text-xs text-muted-foreground self-center">Approved</span>
                )}
                {latestResult.reviewed_at && !latestResult.approved_at && (
                  <span className="text-xs text-muted-foreground self-center">Reviewed — pending approval</span>
                )}
              </div>
            </div>
          </div>
          <div className="h-56 bg-card">
            {latestResult.chromatogram_image ? (
              <img src={latestResult.chromatogram_image} alt="Chromatogram" className="w-full h-full object-contain" />
            ) : (
              <Chromatogram peaks={peaks} />
            )}
          </div>
          {latestResult.report_metadata && (
            <div className="px-4 py-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {Object.entries(latestResult.report_metadata).map(([key, value]) => (
                <div key={key} className="truncate">
                  <span className="capitalize">{key.replace(/_/g, " ")}:</span> <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>
          )}
          {latestResult.calibration_data && (
            <div className="px-4 py-3 border-t border-border space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Calibration Curve</div>
              {latestResult.calibration_image && (
                <img src={latestResult.calibration_image} alt="Calibration curve" className="w-full h-auto max-h-56 object-contain rounded border border-border" />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div>Compound: <span className="text-foreground">{latestResult.calibration_data.compound ?? "—"}</span></div>
                <div>Exp. RT: <span className="text-foreground">{latestResult.calibration_data.exp_rt ?? "—"}</span></div>
                <div>Residual STD: <span className="text-foreground">{latestResult.calibration_data.residual_std ?? "—"}</span></div>
                <div>R: <span className="text-foreground">{latestResult.calibration_data.r ?? "—"}</span></div>
                <div>R²: <span className="text-foreground">{latestResult.calibration_data.r_squared ?? "—"}</span></div>
                <div>Formula: <span className="text-foreground">{latestResult.calibration_data.formula ?? "—"}</span></div>
                <div>a: <span className="text-foreground">{latestResult.calibration_data.a ?? "—"}</span></div>
                <div>b: <span className="text-foreground">{latestResult.calibration_data.b ?? "—"}</span></div>
                <div>c: <span className="text-foreground">{latestResult.calibration_data.c ?? "—"}</span></div>
                {latestResult.calibration_data.d != null && <div>d: <span className="text-foreground">{latestResult.calibration_data.d}</span></div>}
                <div>Scaled: <span className="text-foreground">{latestResult.calibration_data.scaled_label ?? "—"} ({latestResult.calibration_data.scaled_type ?? "—"})</span></div>
                <div>Updated: <span className="text-foreground">{latestResult.calibration_data.calibration_update ?? "—"}</span></div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Peak</th>
                  <th className="text-right px-3 py-2">RT</th>
                  <th className="text-right px-3 py-2">Area</th>
                  <th className="text-right px-3 py-2">Area %</th>
                  <th className="text-left px-3 py-2">Identity</th>
                  <th className="text-right px-3 py-2">Amount/Vial</th>
                  <th className="text-right px-3 py-2">%Label Claim</th>
                  <th className="text-right px-3 py-2">RF</th>
                  <th className="text-right px-3 py-2">Height</th>
                  <th className="text-right px-3 py-2">Conc [mg]</th>
                  <th className="text-right px-3 py-2">Peak Purity</th>
                  <th className="text-center px-3 py-2">Purity Pass</th>
                  <th className="text-right px-3 py-2">UV Match</th>
                  <th className="text-right px-3 py-2">λ [nm]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {peaks.map(p => (
                  <tr key={p.peak_id}>
                    <td className="px-3 py-1.5">{p.peak_id}</td>
                    <td className="px-3 py-1.5 text-right">{p.rt.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right">{p.area != null ? p.area.toFixed(1) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.area_pct.toFixed(3)}</td>
                    <td className="px-3 py-1.5">{p.identity ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.amount_per_vial_mg ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.percent_label_claim ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.rf ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.height ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.concentration_mg ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.peak_purity ?? "—"}</td>
                    <td className="px-3 py-1.5 text-center">{p.peak_purity_passed == null ? "—" : p.peak_purity_passed ? "Pass" : "Fail"}</td>
                    <td className="px-3 py-1.5 text-right">{p.uv_match ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{p.wavelength_nm ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!latestResult && (
        <Card className="p-4 border-border flex items-center justify-between gap-3 flex-wrap">
          {purityWaived ? (
            <>
              <p className="text-xs text-muted-foreground">
                Purity requirement waived{waivedByName ? ` by ${waivedByName}` : ""}{waivedAt ? ` on ${new Date(waivedAt).toLocaleDateString()}` : ""} — this sample can be reviewed/completed without a purity result.
              </p>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onWaivePurity(false)}>Undo</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                No purity data yet. If this sample doesn't require purity (e.g. referee-lab, other-analysis-only), you can skip it instead of entering a result.
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onWaivePurity(true)}>No Purity</Button>
            </>
          )}
        </Card>
      )}

      <Card className="p-5 border-border space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Enter Result</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Import a completed instrument report from Drive, or paste Agilent export rows. Format:{" "}
              <span className="font-mono">rt &nbsp; area &nbsp; area_pct &nbsp; [identity] &nbsp; [s/n]</span> — one peak per line.
            </p>
          </div>
          {!imported && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <CloudDownload className="size-3.5 mr-1" /> Import from Drive
            </Button>
          )}
        </div>

        {imported ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium truncate">{imported.file_name}</div>
              <button type="button" onClick={() => setImported(null)} className="text-muted-foreground hover:text-destructive shrink-0">
                <X className="size-4" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              {imported.peaks.length} compound{imported.peaks.length === 1 ? "" : "s"} imported · purity {imported.purity.toFixed(2)}%
            </div>
            <table className="w-full text-xs font-mono">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Identity</th>
                  <th className="text-right py-1">RT</th>
                  <th className="text-right py-1">Amount/Vial</th>
                  <th className="text-right py-1">Purity %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imported.peaks.map(p => (
                  <tr key={p.peak_id}>
                    <td className="py-1">{p.identity}</td>
                    <td className="py-1 text-right">{p.rt.toFixed(3)}</td>
                    <td className="py-1 text-right">{p.amount_per_vial_mg ?? "—"}</td>
                    <td className="py-1 text-right">{p.area_pct.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <Textarea rows={6} value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder="3.142  154823.5  98.421  Main  812.4&#10;4.027  1245.1  0.792  Impurity-A  18.2"
              className="font-mono text-xs" />
            {pastedFailedCount > 0 && (
              <p className="text-xs text-amber-400">
                {pastedFailedCount} line{pastedFailedCount === 1 ? "" : "s"} couldn't be parsed as "rt area area_pct" and will be skipped.
              </p>
            )}
          </>
        )}

        <Button onClick={handleSubmit} disabled={busy} data-guide="results-submit">{busy ? "Saving…" : "Save Result"}</Button>
      </Card>

      <DriveReportPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        batchId={batchId}
        onImport={setImported}
      />
    </div>
  );
}
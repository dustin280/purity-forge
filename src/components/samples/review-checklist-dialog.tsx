/**
 * Pre-review checklist -- pops up from the pink "Review & Complete" button
 * on the Results tab. Every item mirrors a field the partner-facing COA
 * actually pulls from this app (see /api/public/exports/$batchId.ts, the
 * authoritative "what we provide" payload) so a reviewer can verify the
 * whole certificate's worth of data in one place before completing review,
 * instead of finding a gap after the fact. Every box must be checked
 * before "Confirm & Complete Review" enables -- a real gate, not a
 * formality.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fmtPct, isUnassignedPeak, looksLikeAddOnVialShorthand, type Peak } from "@/lib/lims-utils";
import { purityVerdict, type SpecRange } from "@/lib/lims/spec-verdict";
import type { CalibrationCurve } from "@/lib/results/drive-reports.functions";
import type { LatestResult } from "./results-tab";

const NONCHROM_TYPE_LABEL: Record<string, string> = {
  sterility: "Sterility", endotoxin: "Endotoxin", heavy_metals: "Heavy Metals",
};

interface ChecklistItem {
  key: string;
  label: string;
  value: string;
  ok: boolean; // false = missing/flagged, rendered as a warning regardless of check state
}

export function ReviewChecklistDialog({
  open, onOpenChange, onConfirm, busy,
  batchId, client, lot, appearance, receiptDate,
  latestResult, peaks, spec, analystName, methodName, instrument,
  nonPurityTests, nonchromResults, onUpdateAppearance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  batchId: string;
  client: string;
  lot: string | null;
  appearance: string | null;
  receiptDate: string;
  latestResult: LatestResult;
  peaks: Peak[];
  spec: SpecRange;
  analystName: string | null;
  methodName: string | null;
  instrument: string | null;
  nonPurityTests: Array<{ id: string; test_type: string }>;
  nonchromResults: Array<{ test_id: string }>;
  onUpdateAppearance: (physical_description: string | null) => void;
}) {
  const verdict = latestResult ? purityVerdict(latestResult.purity_percentage, spec) : null;
  const curves: CalibrationCurve[] = latestResult?.calibration_curves?.length
    ? latestResult.calibration_curves
    : latestResult?.calibration_data
      ? [{ compound: latestResult.calibration_data.compound, image: latestResult.calibration_image, data: latestResult.calibration_data }]
      : [];
  const unassignedPeaks = peaks.filter((p) => isUnassignedPeak(p.identity));

  // Local draft so the field can be edited right here to record an actual
  // defect (deviation from the compound's default appearance) -- resyncs
  // whenever the dialog (re)opens or a fresh sample value arrives.
  const [appearanceDraft, setAppearanceDraft] = useState(appearance ?? "");
  useEffect(() => { setAppearanceDraft(appearance ?? ""); }, [appearance, open]);
  function commitAppearance() {
    const next = appearanceDraft.trim();
    if (next !== (appearance ?? "").trim()) onUpdateAppearance(next || null);
  }

  const items: ChecklistItem[] = useMemo(() => [
    { key: "identity", label: "Batch / Client / Lot", value: `${batchId} · ${client}${lot ? ` · Lot ${lot}` : ""}`, ok: true },
    {
      key: "appearance", label: "Appearance",
      value: looksLikeAddOnVialShorthand(appearanceDraft)
        ? "Reads like an add-on-test note, not an appearance — this goes out to the partner export as-is"
        : appearanceDraft || "Not recorded",
      ok: !!appearanceDraft.trim() && !looksLikeAddOnVialShorthand(appearanceDraft),
    },
    { key: "dates", label: "Date received / analysed", value: `${receiptDate} → ${latestResult?.analysis_date ? new Date(latestResult.analysis_date).toLocaleString() : "—"}`, ok: !!latestResult?.analysis_date },
    { key: "purity", label: "Purity result", value: latestResult ? `${fmtPct(latestResult.purity_percentage)} — ${verdict === "pass" ? "PASS" : verdict === "fail" ? "FAIL" : "no spec on file"}` : "No result", ok: !!latestResult && latestResult.purity_percentage != null },
    { key: "uvmatch", label: "UV match / wavelength", value: latestResult ? `${latestResult.uv_conf_match ?? "—"} / ${latestResult.wavelength_nm != null ? `${latestResult.wavelength_nm} nm` : "—"}` : "—", ok: !!latestResult && (latestResult.uv_conf_match != null || latestResult.wavelength_nm != null) },
    { key: "method", label: "Method / instrument", value: `${methodName ?? "—"} / ${instrument ?? "—"}`, ok: !!methodName && !!instrument },
    { key: "analyst", label: "Analyst on record", value: analystName ?? "—", ok: !!analystName },
    { key: "chromatogram", label: "Chromatogram image", value: latestResult?.chromatogram_image ? "Attached" : "Not attached", ok: !!latestResult?.chromatogram_image },
    {
      key: "peaks", label: "Peak table",
      value: peaks.length === 0 ? "No peaks recorded" : `${peaks.length} peak${peaks.length === 1 ? "" : "s"}${unassignedPeaks.length ? ` — ${unassignedPeaks.length} unassigned` : ""}`,
      ok: peaks.length > 0 && unassignedPeaks.length === 0,
    },
    {
      key: "calibration", label: "Calibration curve(s)",
      value: curves.length === 0 ? "Not attached" : curves.map((c) => c.compound ?? "curve").join(", "),
      ok: curves.length > 0,
    },
    ...nonPurityTests.map((t) => {
      const has = nonchromResults.some((r) => r.test_id === t.id);
      return {
        key: `nonchrom-${t.id}`,
        label: `${NONCHROM_TYPE_LABEL[t.test_type] ?? t.test_type} status`,
        value: has ? "Available" : "Pending — Micro/outsourced result not yet entered",
        ok: has,
      };
    }),
  ], [batchId, client, lot, appearanceDraft, receiptDate, latestResult, verdict, methodName, instrument, analystName, peaks, unassignedPeaks.length, curves, nonPurityTests, nonchromResults]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = items.every((i) => checked.has(i.key));

  function toggle(key: string, v: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (v) next.add(key); else next.delete(key);
      return next;
    });
  }

  function handleOpenChange(v: boolean) {
    if (!v) setChecked(new Set());
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Checklist</DialogTitle>
          <DialogDescription>
            Every field the Certificate of Analysis pulls from this sample. Check each item as you verify it —
            all boxes must be checked before you can complete review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {items.map((item) => (
            <label
              key={item.key}
              className={`flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/40 ${!item.ok ? "bg-amber-500/5" : ""}`}
            >
              <Checkbox
                checked={checked.has(item.key)}
                onCheckedChange={(v) => toggle(item.key, !!v)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {item.ok ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                  )}
                  {item.label}
                </div>
                {item.key === "appearance" ? (
                  <Textarea
                    rows={1}
                    value={appearanceDraft}
                    onClick={(e) => e.preventDefault()}
                    onChange={(e) => setAppearanceDraft(e.target.value)}
                    onBlur={commitAppearance}
                    placeholder="e.g. White cake"
                    className="mt-1 h-7 min-h-7 text-xs py-1"
                  />
                ) : (
                  <div className={`text-xs mt-0.5 ${!item.ok ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {item.value}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!allChecked || busy}
            onClick={onConfirm}
            className="bg-[#ff2d95] hover:bg-[#ff54ab] text-white border-0 font-bold"
          >
            Confirm & Complete Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Non-Conformity Identifier" — Track NC. Optional, non-compliance-critical
 * review aid: screens the sample's peaks against the impurity/oligomer
 * library and produces a saved, richly-explained record. Never writes to
 * results/tests/samples.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldAlert, Loader2, FlaskConical } from "lucide-react";
import { resolveNcCompoundForSample } from "@/lib/non-conformity/nc-library.functions";
import {
  previewNcEvaluation,
  saveNcEvaluation,
} from "@/lib/non-conformity/nc-evaluation.functions";
import { resolveDxFileForSample, type DxResolution } from "@/lib/non-conformity/dx-link.functions";
import { DxFilePickerDialog, type PickedDxFile } from "./dx-file-picker-dialog";
import type { RankedCandidate } from "@/lib/non-conformity/engine";

type PeakLike = {
  peak_id: string;
  rt: number;
  area_pct: number;
  peak_purity?: number | null;
  peak_purity_passed?: boolean | null;
  uv_match?: number | null;
};

interface Props {
  sampleId: string;
  resultId: string | null;
  compoundId: string | null;
  compoundName: string | null;
  analysisDate: string | null;
  peaks: PeakLike[];
  actorName: string;
}

const TIER_LABEL: Record<string, { label: string; className: string }> = {
  candidate: { label: "Candidate", className: "bg-muted text-muted-foreground border-border" },
  probable_class: {
    label: "Probable class",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  probable_identity: {
    label: "Probable identity",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
};

export function NonConformityButton({
  sampleId,
  resultId,
  compoundId,
  compoundName,
  analysisDate,
  peaks,
  actorName,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [ncCompoundId, setNcCompoundId] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [stressContext, setStressContext] = useState("");
  const [preview, setPreview] = useState<Awaited<
    ReturnType<ReturnType<typeof useServerFn<typeof previewNcEvaluation>>>
  > | null>(null);
  const [dxResolution, setDxResolution] = useState<DxResolution | null>(null);
  const [dxPicked, setDxPicked] = useState<PickedDxFile | null>(null);
  const [dxManual, setDxManual] = useState(false);
  const [dxPickerOpen, setDxPickerOpen] = useState(false);

  const resolve = useServerFn(resolveNcCompoundForSample);
  const preview_ = useServerFn(previewNcEvaluation);
  const save = useServerFn(saveNcEvaluation);
  const resolveDx = useServerFn(resolveDxFileForSample);

  const resolveMut = useMutation({
    mutationFn: () => resolve({ data: { compoundId, compoundName } }),
    onSuccess: (r) => {
      if (r.nc_compound_id) {
        setNcCompoundId(r.nc_compound_id);
        setResolvedName(r.name);
        setUnmatched(false);
      } else setUnmatched(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveDxMut = useMutation({
    mutationFn: () =>
      resolveDx({
        data: {
          sample_id: sampleId,
          result_id: resultId,
          compound_name: compoundName,
          analysis_date: analysisDate,
        },
      }),
    onSuccess: (r) => setDxResolution(r),
    onError: () => setDxResolution({ confidence: "none" }), // spectral resolution is best-effort — never surface an error here
  });

  const dxFileId = dxManual
    ? (dxPicked?.dx_file_id ?? null)
    : dxResolution?.confidence === "auto"
      ? dxResolution.dx_file_id
      : null;
  const dxFolderId = dxManual
    ? (dxPicked?.dx_folder_id ?? null)
    : dxResolution?.confidence === "auto"
      ? dxResolution.dx_folder_id
      : null;
  const dxConfidence: "auto" | "manual" | "none" = dxFileId
    ? dxManual
      ? "manual"
      : "auto"
    : "none";

  const previewMut = useMutation({
    mutationFn: () =>
      preview_({
        data: {
          sample_id: sampleId,
          result_id: resultId,
          nc_compound_id: ncCompoundId!,
          peaks: peaks.map((p) => ({
            peak_id: p.peak_id,
            rt: p.rt,
            area_pct: p.area_pct,
            peak_purity: p.peak_purity ?? null,
            peak_purity_passed: p.peak_purity_passed ?? null,
            uv_match: p.uv_match ?? null,
          })),
          stress_context: stressContext.trim() || null,
        },
      }),
    onSuccess: (r) => setPreview(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Nothing to save");
      const findings = preview.findings.map((f) => {
        const top = f.ranked[0] as RankedCandidate | undefined;
        return {
          peak_id: f.peak_id,
          rt: f.rt,
          area_pct: f.area_pct,
          peak_purity: f.peak_purity,
          peak_purity_passed: f.peak_purity_passed,
          uv_match: f.uv_match,
          candidate_kind: top ? top.candidate.kind : null,
          matched_candidate_id: top ? top.candidate.id : null,
          component_scores: top ? { ...top.scores } : {},
          tier: top ? top.tier : ("unflagged" as const),
          rationale: top
            ? `${top.candidate.name} — ${top.candidate.rpHplcBehavior ?? "no RT guidance on file"}`
            : null,
          analyst_note: null,
        };
      });
      const overallTier = findings.some((f) => f.tier === "probable_identity")
        ? "probable_identity"
        : findings.some((f) => f.tier === "probable_class")
          ? "probable_class"
          : findings.some((f) => f.tier === "candidate")
            ? "candidate"
            : "clear";
      return save({
        data: {
          sample_id: sampleId,
          result_id: resultId,
          nc_compound_id: ncCompoundId!,
          run_by_name: actorName,
          stress_context: stressContext.trim() || null,
          summary: `Screened against ${preview.compound_name} — ${preview.findings.length} peak(s) above ${0.1}% area reviewed.`,
          overall_tier: overallTier,
          findings,
          dx_file_id: dxFileId,
          dx_folder_id: dxFolderId,
          dx_match_confidence: dxConfidence,
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Evaluation saved");
      setOpen(false);
      navigate({ to: "/non-conformity/$evaluationId", params: { evaluationId: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleOpen() {
    setOpen(true);
    setPreview(null);
    setNcCompoundId(null);
    setUnmatched(false);
    setDxResolution(null);
    setDxPicked(null);
    setDxManual(false);
    resolveMut.mutate();
    resolveDxMut.mutate();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen}>
        <ShieldAlert className="size-3.5 mr-1" /> Non-Conformity Identifier
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Non-Conformity Identifier</DialogTitle>
            <DialogDescription>
              Screens this sample's peaks against the impurity/oligomer reference library.
              Informational only — not part of the review/approve trail.
            </DialogDescription>
          </DialogHeader>

          {resolveMut.isPending && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              <Loader2 className="size-4 animate-spin inline mr-2" />
              Resolving compound…
            </div>
          )}

          {!resolveMut.isPending && unmatched && (
            <div className="text-sm text-muted-foreground py-6 text-center space-y-2">
              <p>No library entry found for "{compoundName ?? "this compound"}" yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ to: "/non-conformity/library" })}
              >
                Add it to the library
              </Button>
            </div>
          )}

          {!resolveMut.isPending && ncCompoundId && !preview && (
            <div className="space-y-3">
              <p className="text-sm">
                Matched: <span className="font-medium">{resolvedName}</span>
              </p>
              <div>
                <Label className="text-xs">Storage/stress context (optional)</Label>
                <Textarea
                  rows={2}
                  value={stressContext}
                  onChange={(e) => setStressContext(e.target.value)}
                  placeholder="e.g. sample known to have been under heat/light stress"
                  className="mt-1"
                />
              </div>
              <div className="text-xs flex items-center gap-2 text-muted-foreground">
                <FlaskConical className="size-3.5 shrink-0" />
                {resolveDxMut.isPending && "Looking for raw spectral data…"}
                {!resolveDxMut.isPending && dxFileId && (
                  <span>
                    Spectral data: found
                    {dxManual
                      ? " (picked manually)"
                      : dxResolution?.confidence === "auto" && !dxResolution.reused
                        ? ` — auto-matched to "${dxResolution.manifest_sample_name ?? "unknown sample"}"`
                        : ""}
                    .{" "}
                    <button
                      type="button"
                      onClick={() => setDxPickerOpen(true)}
                      className="underline hover:text-foreground"
                    >
                      Not this one?
                    </button>
                  </span>
                )}
                {!resolveDxMut.isPending && !dxFileId && (
                  <span>
                    Spectral data: not auto-matched.{" "}
                    <button
                      type="button"
                      onClick={() => setDxPickerOpen(true)}
                      className="underline hover:text-foreground"
                    >
                      Browse manually
                    </button>
                  </span>
                )}
              </div>
              <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
                {previewMut.isPending ? "Running…" : "Run Analysis"}
              </Button>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              {preview.findings.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No peaks above the 0.1% area threshold besides the main peak — nothing to flag.
                </p>
              )}
              {preview.findings.map((f) => {
                const top = f.ranked[0] as RankedCandidate | undefined;
                return (
                  <div key={f.peak_id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-mono">
                        Peak {f.peak_id} · RT {f.rt.toFixed(3)} · {f.area_pct.toFixed(3)}%
                      </div>
                      {top && (
                        <Badge variant="outline" className={TIER_LABEL[top.tier].className}>
                          {TIER_LABEL[top.tier].label}
                        </Badge>
                      )}
                    </div>
                    {top ? (
                      <div className="text-xs space-y-1">
                        <div className="font-medium">
                          {top.candidate.name}{" "}
                          <span className="text-muted-foreground">({top.candidate.kind})</span>
                        </div>
                        <div className="text-muted-foreground">
                          {top.candidate.rpHplcBehavior ?? "No RT guidance on file"}
                        </div>
                        {top.candidate.falsePositiveWarning && (
                          <div className="text-amber-600">
                            ⚠ {top.candidate.falsePositiveWarning}
                          </div>
                        )}
                        <div className="text-muted-foreground">
                          Score {top.scores.total.toFixed(0)} / {top.scores.maxPossible}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No candidates on file for this compound.
                      </div>
                    )}
                    {f.next_steps.length > 0 && (
                      <ul className="text-xs list-disc pl-4 space-y-0.5 text-muted-foreground">
                        {f.next_steps.map((s, i) => (
                          <li key={i}>{s.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {preview && (
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save Evaluation"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DxFilePickerDialog
        open={dxPickerOpen}
        onOpenChange={setDxPickerOpen}
        onPick={(picked) => {
          setDxPicked(picked);
          setDxManual(true);
        }}
      />
    </>
  );
}

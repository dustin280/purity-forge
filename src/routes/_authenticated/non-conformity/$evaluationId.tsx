import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import {
  getNcEvaluationDetail,
  listNcEvaluationsForSample,
} from "@/lib/non-conformity/nc-evaluation.functions";

/** Row shape for tables not yet in the generated Supabase types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const Route = createFileRoute("/_authenticated/non-conformity/$evaluationId")({
  component: NcEvaluationReport,
});

const TIER_LABEL: Record<string, { label: string; className: string }> = {
  clear: { label: "Clear", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  candidate: { label: "Candidate", className: "bg-muted text-muted-foreground border-border" },
  probable_class: {
    label: "Probable class",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  probable_identity: {
    label: "Probable identity",
    className: "bg-red-500/15 text-red-600 border-red-500/30",
  },
  unflagged: { label: "Unflagged", className: "bg-muted text-muted-foreground border-border" },
};

function NcEvaluationReport() {
  const { evaluationId } = Route.useParams();
  const get = useServerFn(getNcEvaluationDetail);
  const listSibling = useServerFn(listNcEvaluationsForSample);

  const { data, isLoading } = useQuery({
    queryKey: ["nc-evaluation", evaluationId],
    queryFn: () => get({ data: { id: evaluationId } }),
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ["nc-evaluations", "sample", data?.evaluation.sample_id],
    queryFn: () => listSibling({ data: { sampleId: data!.evaluation.sample_id } }),
    enabled: !!data?.evaluation.sample_id,
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-destructive">Evaluation not found.</div>;

  const { evaluation, findings, sample, chromatogram_image } = data;
  const overallTier = TIER_LABEL[evaluation.overall_tier] ?? TIER_LABEL.candidate;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl grid lg:grid-cols-[1fr_260px] gap-6">
      <div className="space-y-6 min-w-0">
        {sample && (
          <Link
            to="/samples/$batchId"
            params={{ batchId: sample.batch_id }}
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> {sample.batch_id}
          </Link>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <ShieldAlert className="size-3" /> Non-Conformity Evaluation
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              {evaluation.nc_compound?.name ?? "—"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {sample?.client ? `${sample.client} · ` : ""}
              {new Date(evaluation.run_at).toLocaleString()} · {evaluation.run_by_name}
            </p>
          </div>
          <Badge variant="outline" className={overallTier.className}>
            {overallTier.label}
          </Badge>
        </div>

        {evaluation.stress_context && (
          <Card className="p-3 text-sm text-muted-foreground">
            Stress context: {evaluation.stress_context}
          </Card>
        )}

        {chromatogram_image && (
          <Card className="p-0 overflow-hidden">
            <img
              src={chromatogram_image}
              alt="Chromatogram"
              className="w-full h-56 object-contain bg-card"
            />
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Findings ({findings.length})</h2>
          {findings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No peaks were flagged for this evaluation.
            </p>
          )}
          {findings.map((f: Row) => {
            const tier = TIER_LABEL[f.tier] ?? TIER_LABEL.candidate;
            return (
              <Card key={f.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono">
                    Peak {f.peak_id} · RT {Number(f.rt).toFixed(3)} ·{" "}
                    {Number(f.area_pct).toFixed(3)}%
                  </div>
                  <Badge variant="outline" className={tier.className}>
                    {tier.label}
                  </Badge>
                </div>
                {f.candidate ? (
                  <div className="text-sm space-y-1">
                    <div className="font-medium">
                      {f.candidate.name}{" "}
                      <span className="text-xs text-muted-foreground">({f.candidate_kind})</span>
                    </div>
                    {f.candidate.evidence_level && (
                      <div className="text-xs text-muted-foreground">
                        Evidence: {f.candidate.evidence_level}
                      </div>
                    )}
                    {(f.candidate.formation_pathway || f.candidate.mechanism_pathway) && (
                      <div className="text-xs text-muted-foreground">
                        {f.candidate.formation_pathway ?? f.candidate.mechanism_pathway}
                      </div>
                    )}
                    {f.candidate.dad_discriminator && (
                      <div className="text-xs text-muted-foreground">
                        {f.candidate.dad_discriminator}
                      </div>
                    )}
                    {f.candidate.false_positive_warning && (
                      <div className="text-xs text-amber-600">
                        ⚠ {f.candidate.false_positive_warning}
                      </div>
                    )}
                    {f.candidate.source_url && (
                      <a
                        href={f.candidate.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline block"
                      >
                        Source
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No candidate matched.</div>
                )}
                {f.spectral_detail && (
                  <div className="text-xs text-muted-foreground border-t border-dashed pt-2">
                    Real DAD spectrum: cosine to parent{" "}
                    {Number(f.spectral_detail.cosineToParent).toFixed(2)}
                    {Array.isArray(f.spectral_detail.ratios) &&
                      f.spectral_detail.ratios.some((r: Row) => r.value != null) && (
                        <>
                          {" · "}
                          {f.spectral_detail.ratios
                            .filter((r: Row) => r.value != null)
                            .map((r: Row) => `${r.label}=${Number(r.value).toFixed(2)}`)
                            .join(", ")}
                        </>
                      )}
                  </div>
                )}
                {f.rationale && (
                  <div className="text-xs text-muted-foreground border-t border-dashed pt-2">
                    {f.rationale}
                  </div>
                )}
                {f.analyst_note && (
                  <div className="text-xs border-t border-dashed pt-2">Note: {f.analyst_note}</div>
                )}
              </Card>
            );
          })}
        </div>

        {evaluation.summary && (
          <Card className="p-4 text-sm text-muted-foreground">{evaluation.summary}</Card>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Past Evaluations
        </h2>
        {siblings.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
        {siblings.map((s) => (
          <Link
            key={s.id}
            to="/non-conformity/$evaluationId"
            params={{ evaluationId: s.id }}
            className={`block p-2 rounded-md text-xs border ${s.id === evaluationId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
          >
            <div className="font-medium">{s.nc_compound?.name ?? "—"}</div>
            <div className="text-muted-foreground">
              {new Date(s.run_at).toLocaleDateString()} ·{" "}
              {(TIER_LABEL[s.overall_tier] ?? TIER_LABEL.candidate).label}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

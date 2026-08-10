import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Chromatogram } from "@/components/lims/chromatogram";
import { fmtPct, type Peak } from "@/lib/lims-utils";
import { purityVerdict, type SpecRange } from "@/lib/lims/spec-verdict";

type LatestResult = {
  id: string;
  purity_percentage: number | null;
  analysis_date: string;
  analyst_id: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
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
}: {
  latestResult: LatestResult;
  peaks: Peak[];
  pasted: string;
  setPasted: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  spec: SpecRange;
  currentUserId: string | null;
  onReview: (resultId: string) => void;
  onApprove: (resultId: string) => void;
}) {
  const verdict = latestResult ? purityVerdict(latestResult.purity_percentage, spec) : null;
  const verdictColor = verdict === "pass" ? "var(--status-success)" : verdict === "fail" ? "var(--destructive)" : "var(--muted-foreground)";
  const canReview = !!latestResult && !latestResult.reviewed_at && latestResult.analyst_id !== currentUserId;
  const canApprove = !!latestResult && !!latestResult.reviewed_at && !latestResult.approved_at;

  return (
    <div className="space-y-4">
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
              <div className="flex gap-1.5 justify-end">
                {canReview && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onReview(latestResult.id)}>Review</Button>
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
            <Chromatogram peaks={peaks} />
          </div>
          <table className="w-full text-xs font-mono">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Peak</th>
                <th className="text-right px-3 py-2">RT</th>
                <th className="text-right px-3 py-2">Area</th>
                <th className="text-right px-3 py-2">Area %</th>
                <th className="text-left px-3 py-2">Identity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {peaks.map(p => (
                <tr key={p.peak_id}>
                  <td className="px-3 py-1.5">{p.peak_id}</td>
                  <td className="px-3 py-1.5 text-right">{p.rt.toFixed(3)}</td>
                  <td className="px-3 py-1.5 text-right">{p.area.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right">{p.area_pct.toFixed(3)}</td>
                  <td className="px-3 py-1.5">{p.identity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-5 border-border space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Enter Result</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste Agilent export rows. Format: <span className="font-mono">rt &nbsp; area &nbsp; area_pct &nbsp; [identity] &nbsp; [s/n]</span> — one peak per line.
          </p>
        </div>
        <Textarea rows={6} value={pasted} onChange={e => setPasted(e.target.value)}
          placeholder="3.142  154823.5  98.421  Main  812.4&#10;4.027  1245.1  0.792  Impurity-A  18.2"
          className="font-mono text-xs" />
        <Button onClick={onSubmit} disabled={busy} data-guide="results-submit">{busy ? "Saving…" : "Save Result"}</Button>
      </Card>
    </div>
  );
}
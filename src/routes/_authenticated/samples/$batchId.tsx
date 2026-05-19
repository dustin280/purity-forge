import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getSampleDetail, updateSampleStatus, saveResult } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/lims/status-pill";
import { Chromatogram } from "@/components/lims/chromatogram";
import { generateCoaPdf } from "@/lib/coa-pdf";
import { fmtPct, type SampleStatus, type Peak } from "@/lims-utils-shim";
import { toast } from "sonner";
import { Download, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/samples/$batchId")({ component: SampleDetail });

function SampleDetail() {
  const { batchId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getSampleDetail);
  const setStatusFn = useServerFn(updateSampleStatus);
  const saveResultFn = useServerFn(saveResult);
  const { data, isLoading } = useQuery({
    queryKey: ["sample", batchId],
    queryFn: () => fn({ data: { batchId } }),
  });

  const [tab, setTab] = useState<"info" | "results" | "coa">("info");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-8">Not found</div>;

  const { sample, tests, results } = data;
  const test = tests[0];
  const latestResult = results[results.length - 1];
  const peaks: Peak[] = (latestResult?.peak_details as Peak[] | null) ?? [];

  async function changeStatus(status: SampleStatus) {
    setBusy(true);
    try {
      await setStatusFn({ data: { sampleId: sample.id, status } });
      toast.success(`Status → ${status}`);
      qc.invalidateQueries({ queryKey: ["sample", batchId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  function parsePeaks(text: string): { peaks: Peak[]; purity: number } {
    // Accept lines: "rt area area_pct [identity] [sn]" tab/space/csv separated.
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out: Peak[] = [];
    lines.forEach((line, i) => {
      const cols = line.split(/[\s,;\t]+/);
      const rt = parseFloat(cols[0]); const area = parseFloat(cols[1]); const pct = parseFloat(cols[2]);
      if (isNaN(rt) || isNaN(area)) return;
      out.push({
        peak_id: `P${i + 1}`, rt, area,
        area_pct: isNaN(pct) ? 0 : pct,
        identity: cols[3] && isNaN(parseFloat(cols[3])) ? cols[3] : undefined,
        sn: cols[4] ? parseFloat(cols[4]) : undefined,
      });
    });
    // purity = main peak area %
    const main = out.reduce((a, b) => (b.area_pct > (a?.area_pct ?? 0) ? b : a), out[0]);
    return { peaks: out, purity: main?.area_pct ?? 0 };
  }

  async function submitResult() {
    if (!test) return toast.error("No test assigned");
    const { peaks, purity } = parsePeaks(pasted);
    if (peaks.length === 0) return toast.error("Paste at least one peak (rt area area_pct)");
    setBusy(true);
    try {
      await saveResultFn({ data: { testId: test.id, purity_percentage: purity, peaks } });
      await setStatusFn({ data: { sampleId: sample.id, status: "in_progress" } });
      toast.success(`Result saved — ${purity.toFixed(2)}% purity`);
      setPasted("");
      qc.invalidateQueries({ queryKey: ["sample", batchId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  function downloadCoa() {
    if (!test || !latestResult) return toast.error("No result to certify");
    const pdf = generateCoaPdf({
      sample: { batch_id: sample.batch_id, client: sample.client, project: sample.project, receipt_date: sample.receipt_date, notes: sample.notes },
      test: { method_name: test.method_name, instrument: test.instrument, parameters: test.parameters as Record<string, unknown> | null },
      result: {
        purity_percentage: latestResult.purity_percentage,
        analysis_date: latestResult.analysis_date,
        peak_details: peaks,
      },
      analyst: latestResult.analyst_id,
      reviewer: latestResult.reviewer_id,
      approved_at: latestResult.approved_at,
    });
    pdf.save(`COA_${sample.batch_id}.pdf`);
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center text-xs text-muted-foreground gap-1">
        <Link to="/samples" className="hover:text-foreground">Samples</Link>
        <ChevronRight className="size-3" />
        <span className="font-mono">{sample.batch_id}</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight">{sample.batch_id}</h1>
          <p className="text-sm text-muted-foreground mt-1">{sample.client}{sample.project ? ` · ${sample.project}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={sample.status as SampleStatus} />
          <div className="flex gap-1.5">
            {sample.status === "in_progress" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus("reviewed")}>Mark Reviewed</Button>
            )}
            {sample.status === "reviewed" && (
              <Button size="sm" disabled={busy} onClick={() => changeStatus("approved")}>Approve</Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["info", "results", "coa"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold border-b-2 -mb-px ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "coa" ? "COA" : t}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5 border-border">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Sample</h3>
            <dl className="space-y-2 text-sm">
              <Row k="Client" v={sample.client} />
              <Row k="Project" v={sample.project ?? "—"} />
              <Row k="Receipt" v={sample.receipt_date} />
              <Row k="Created" v={new Date(sample.created_at).toLocaleString()} />
              <Row k="Notes" v={sample.notes ?? "—"} />
            </dl>
          </Card>
          <Card className="p-5 border-border">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Test Method</h3>
            <dl className="space-y-2 text-sm">
              <Row k="Method" v={test?.method_name ?? "—"} />
              <Row k="Instrument" v={test?.instrument ?? "—"} />
              <Row k="Status" v={test?.status ?? "—"} />
            </dl>
          </Card>
        </div>
      )}

      {tab === "results" && (
        <div className="space-y-4">
          {latestResult && (
            <Card className="border-border overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-border">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Latest Purity</div>
                  <div className="text-3xl font-mono font-bold" style={{ color: "var(--status-success)" }}>
                    {fmtPct(latestResult.purity_percentage)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {new Date(latestResult.analysis_date).toLocaleString()}
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
            <Button onClick={submitResult} disabled={busy}>{busy ? "Saving…" : "Save Result"}</Button>
          </Card>
        </div>
      )}

      {tab === "coa" && (
        <Card className="p-6 border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Certificate of Analysis</h3>
              <p className="text-xs text-muted-foreground mt-1">Generates a signed COA PDF with sample, method, peak table, and signature blocks.</p>
            </div>
            <Button onClick={downloadCoa} disabled={!latestResult}>
              <Download className="size-4 mr-1" />Download COA
            </Button>
          </div>
          {!latestResult && <p className="text-xs text-muted-foreground mt-4">Save a result first to generate the COA.</p>}
        </Card>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground text-xs uppercase tracking-wider">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
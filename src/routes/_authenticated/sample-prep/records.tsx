import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import { listRecords, type RecordStatus } from "@/lib/sample-prep/records.functions";
import { listAnalytes, listMethods } from "@/lib/sample-prep/master-data.functions";
import { FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sample-prep/records")({
  head: () => ({ meta: [
    { title: "Preparation Records · Sample Prep" },
    { name: "description", content: "Traceable preparation records with method, analyte, lots, and reviewer sign-off." },
    { property: "og:title", content: "Preparation Records" },
    { property: "og:description", content: "Traceable preparation records with reviewer sign-off." },
  ]}),
  component: RecordsList,
});

const STATUS_LABELS: Record<RecordStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_VARIANT: Record<RecordStatus, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "outline",
  in_progress: "secondary",
  awaiting_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

function RecordsList() {
  const list = useServerFn(listRecords);
  const analytes = useServerFn(listAnalytes);
  const methods = useServerFn(listMethods);
  const recordsQ = useQuery({ queryKey: ["sp-records"], queryFn: () => list() });
  const analytesQ = useQuery({ queryKey: ["sp-analytes"], queryFn: () => analytes() });
  const methodsQ = useQuery({ queryKey: ["sp-methods"], queryFn: () => methods() });

  const analyteName = (id: string) => analytesQ.data?.find(a => a.id === id)?.canonical_name ?? "—";
  /** Registered analyte if there is one, else the sample's own compound. */
  const analyteLabel = (r: { analyte_id?: string | null; sample_compound?: string | null }) => {
    const named = r.analyte_id ? analyteName(r.analyte_id) : "—";
    if (named !== "—") return named;
    return r.sample_compound?.trim() || "—";
  };
  const methodName = (revId: string) => {
    const rev = methodsQ.data?.revisions.find(r => r.id === revId);
    if (!rev) return "—";
    const m = methodsQ.data?.methods.find(mm => mm.id === rev.method_id);
    return m ? `${m.name} · v${rev.version}.${rev.revision}` : `v${rev.version}.${rev.revision}`;
  };

  return (
    <SamplePrepShell
      title="Preparation Records"
      description="Traceable preparation records: method revision, analyte, lot, bench execution, and reviewer sign-off."
    >
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/sample-prep/new"><FlaskConical className="size-4 mr-1" /> New preparation</Link>
        </Button>
      </div>
      {recordsQ.isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!recordsQ.isLoading && (recordsQ.data ?? []).length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          No preparation records yet. Complete the wizard and click <strong>Save as draft</strong> to persist one.
        </Card>
      )}
      {!!recordsQ.data?.length && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Prep #</th>
                <th className="text-left p-3">Analyte</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Sample / Lot</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {recordsQ.data.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono">
                    <Link to="/sample-prep/records/$id" params={{ id: r.id }} className="underline">
                      {r.prep_number}
                    </Link>
                  </td>
                  <td className="p-3">{analyteLabel(r)}</td>
                  <td className="p-3">{methodName(r.method_revision_id ?? "")}</td>

                  <td className="p-3">
                    {r.sample_id || "—"}
                    {r.lot_number ? <span className="text-muted-foreground"> · {r.lot_number}</span> : null}
                  </td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[r.status as RecordStatus]}>
                      {STATUS_LABELS[r.status as RecordStatus]}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </SamplePrepShell>
  );
}
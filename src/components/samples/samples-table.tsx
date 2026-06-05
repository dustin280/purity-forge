import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@/components/lims/status-pill";
import { type SampleStatus } from "@/lib/lims-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setSamplePrepFlag } from "@/lib/run-lists.functions";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";

type SampleRow = {
  id: string;
  batch_id: string;
  client: string;
  project: string | null;
  receipt_date: string;
  status: string;
  compound?: string | null;
  lot?: string | null;
  prep_flag?: boolean | null;
};

/**
 * Samples list as a Card-wrapped table. Each Sample ID links to its
 * detail page. Renders loading + empty states inline.
 */
export function SamplesTable({
  rows, isLoading,
}: {
  rows: SampleRow[];
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const setFlag = useServerFn(setSamplePrepFlag);
  const toggle = useMutation({
    mutationFn: (v: { sample_id: string; flag: boolean }) => setFlag({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.samples.all });
      qc.invalidateQueries({ queryKey: qk.runLists.prepFlagged() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-3 font-semibold w-10">Prep</th>
            <th className="text-left px-4 py-3 font-semibold">Sample ID</th>
            <th className="text-left px-4 py-3 font-semibold">Compound / Lot</th>
            <th className="text-left px-4 py-3 font-semibold">Client / Project</th>
            <th className="text-left px-4 py-3 font-semibold">Received</th>
            <th className="text-left px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No samples match.</td></tr>
          )}
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-muted/30 cursor-pointer">
              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={!!s.prep_flag}
                  onCheckedChange={(v) => toggle.mutate({ sample_id: s.id, flag: !!v })}
                  aria-label="Prep flag"
                />
              </td>
              <td className="px-4 py-3">
                <Link to="/samples/$batchId" params={{ batchId: s.batch_id }}
                  className="font-mono font-semibold text-primary hover:underline">{s.batch_id}</Link>
              </td>
              <td className="px-4 py-3">
                <div>{s.compound ?? "—"}</div>
                {s.lot && <div className="text-xs text-muted-foreground font-mono">Lot {s.lot}</div>}
              </td>
              <td className="px-4 py-3">
                <div>{s.client}</div>
                {s.project && <div className="text-xs text-muted-foreground">{s.project}</div>}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{s.receipt_date}</td>
              <td className="px-4 py-3"><StatusPill status={s.status as SampleStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
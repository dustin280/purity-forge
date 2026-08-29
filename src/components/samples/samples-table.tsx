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
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

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

export type SamplesSortKey = "batch_id" | "compound" | "client" | "receipt_date" | "status";
export type SortDir = "asc" | "desc";

const COLUMNS: { key: SamplesSortKey; label: string }[] = [
  { key: "batch_id", label: "Sample ID" },
  { key: "compound", label: "Compound / Lot" },
  { key: "client", label: "Client / Project" },
  { key: "receipt_date", label: "Received" },
  { key: "status", label: "Status" },
];

/**
 * Samples list as a Card-wrapped table. Each Sample ID links to its
 * detail page. Renders loading + empty states inline. Sorting is
 * controlled by the parent (SamplesList owns sort/page state) — this
 * component only renders the clickable headers and current rows.
 */
export function SamplesTable({
  rows, isLoading, sortKey, sortDir, onSort, selectedIds, onToggleSelect, onToggleAll,
}: {
  rows: SampleRow[];
  isLoading: boolean;
  sortKey: SamplesSortKey;
  sortDir: SortDir;
  onSort: (key: SamplesSortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const qc = useQueryClient();
  const setFlag = useServerFn(setSamplePrepFlag);
  const toggle = useMutation({
    mutationFn: (v: { sample_id: string; flag: boolean }) => setFlag({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.samples.list() });
      const previous = qc.getQueryData<SampleRow[]>(qk.samples.list());
      qc.setQueryData<SampleRow[]>(qk.samples.list(), (rows) =>
        rows?.map((r) => (r.id === v.sample_id ? { ...r, prep_flag: v.flag } : r)));
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.samples.list(), ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.samples.all });
      qc.invalidateQueries({ queryKey: qk.runLists.prepFlagged() });
    },
  });
  return (
    <Card className="border-border overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-3 font-semibold w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => onToggleAll(!!v)}
                aria-label="Select all samples"
              />
            </th>
            <th className="text-left px-3 py-3 font-semibold w-10">Prep</th>
            {COLUMNS.map((col) => (
              <th key={col.key} className="text-left px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3 opacity-40" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No samples match.</td></tr>
          )}
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-muted/30 cursor-pointer">
              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(s.id)}
                  onCheckedChange={(v) => onToggleSelect(s.id, !!v)}
                  aria-label={`Select ${s.batch_id}`}
                />
              </td>
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
      </div>
    </Card>
  );
}

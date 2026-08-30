import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/lims/status-pill";
import { type SampleStatus } from "@/lib/lims-utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueWorkListRow } from "@/lib/queue.functions";

/**
 * Which non-HPLC tests a vial is flagged for, shown inline in the queue.
 * Abbreviated because these sit under a sample id in a dense table -- the
 * full words push the column too wide to scan. Colour carries the same
 * meaning as the label so a glance down the column is enough.
 */
const NON_PURITY_BADGE: Record<string, { short: string; className: string }> = {
  sterility: { short: "STER", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  endotoxin: { short: "ENDO", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  heavy_metals: { short: "HVYM", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
};

function NonPurityBadges({ types }: { types: string[] | undefined }) {
  if (!types?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {types.map((t) => {
        const b = NON_PURITY_BADGE[t];
        return (
          <span key={t} title={t.replace("_", " ")}
            className={cn("text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded", b?.className ?? "bg-muted text-muted-foreground")}>
            {b?.short ?? t.toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

export type QueueSortKey = "batch_id" | "compound" | "client" | "due_date" | "status" | "receipt_date";
export type SortDir = "asc" | "desc";

const COLUMNS: { key: QueueSortKey; label: string }[] = [
  { key: "batch_id", label: "Sample ID" },
  { key: "compound", label: "Compound / Lot" },
  { key: "client", label: "Client" },
  { key: "receipt_date", label: "Received" },
  { key: "due_date", label: "Due" },
  { key: "status", label: "Status" },
];

function dueClass(dueDate: string, today: string): string {
  if (dueDate < today) return "text-destructive font-semibold";
  if (dueDate === today) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "";
}

/**
 * Flat, fully sortable list of every non-cancelled sample -- no capacity
 * bucketing, no auto-scheduling. Due date is shown (and sortable) purely as
 * information; it never excludes a sample from being selected. A completed
 * sample stays selectable here for reruns.
 */
export function QueueWorkTable({
  rows, isLoading, sortKey, sortDir, onSort, selectedIds, onToggleSelect, onToggleAll, today,
}: {
  rows: QueueWorkListRow[];
  isLoading: boolean;
  sortKey: QueueSortKey;
  sortDir: SortDir;
  onSort: (key: QueueSortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  today: string;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  return (
    <Card className="border-border overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-3 font-semibold w-10">
              <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleAll(!!v)} aria-label="Select all samples" />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} className="text-left px-4 py-3 font-semibold">
                <button type="button" onClick={() => onSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3 opacity-40" />
                  )}
                </button>
              </th>
            ))}
            <th className="text-left px-4 py-3 font-semibold">Checked out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No samples.</td></tr>
          )}
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30">
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selectedIds.has(s.id)} onCheckedChange={(v) => onToggleSelect(s.id, !!v)} aria-label={`Select ${s.batch_id}`} />
              </td>
              <td className="px-4 py-3">
                <Link to="/samples/$batchId" params={{ batchId: s.batch_id }} className="font-mono font-semibold text-primary hover:underline">
                  {s.batch_id}
                </Link>
                <NonPurityBadges types={s.non_purity_tests} />
              </td>
              <td className="px-4 py-3">
                <div>{s.compound ?? "—"}</div>
                {s.lot && <div className="text-xs text-muted-foreground font-mono">Lot {s.lot}</div>}
              </td>
              <td className="px-4 py-3">{s.client}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.receipt_date}</td>
              <td className={cn("px-4 py-3 font-mono text-xs", dueClass(s.due_date, today))}>{s.due_date}</td>
              <td className="px-4 py-3"><StatusPill status={s.status as SampleStatus} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {s.prep_flag ? (s.prep_flagged_by_name ?? "Someone") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

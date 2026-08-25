import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/lims/status-pill";
import { type SampleStatus } from "@/lib/lims-utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueWorkListRow } from "@/lib/queue.functions";

export type QueueSortKey = "batch_id" | "compound" | "client" | "due_date" | "status";
export type SortDir = "asc" | "desc";

const COLUMNS: { key: QueueSortKey; label: string }[] = [
  { key: "batch_id", label: "Sample ID" },
  { key: "compound", label: "Compound / Lot" },
  { key: "client", label: "Client" },
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
          {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No samples.</td></tr>
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
              </td>
              <td className="px-4 py-3">
                <div>{s.compound ?? "—"}</div>
                {s.lot && <div className="text-xs text-muted-foreground font-mono">Lot {s.lot}</div>}
              </td>
              <td className="px-4 py-3">{s.client}</td>
              <td className={cn("px-4 py-3 font-mono text-xs", dueClass(s.due_date, today))}>{s.due_date}</td>
              <td className="px-4 py-3"><StatusPill status={s.status as SampleStatus} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {s.prep_flag ? (s.prep_flagged_by_name ?? "Someone") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

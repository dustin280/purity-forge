import { useState } from "react";
import { ChevronLeft, ChevronRight, Gauge, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BackpressureRow } from "@/lib/daily-backpressure.functions";

const PAGE_SIZE = 100;

interface ReadingsTableProps {
  /** every row in the selected range, newest first */
  rows: BackpressureRow[];
  isLoading: boolean;
  isAdmin: boolean;
  deleteLoading: boolean;
  onDelete: (id: string) => void;
  /** the fetch stopped at its cap; narrow the range to see the rest */
  truncated?: boolean;
}

export function ReadingsTable({
  rows,
  isLoading,
  isAdmin,
  deleteLoading,
  onDelete,
  truncated = false,
}: ReadingsTableProps) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Readings
          {rows.length > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal">
              {rows.length} in range{truncated ? " (capped — narrow the range for the rest)" : ""}
            </span>
          )}
        </div>
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={current === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={current >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center">
          <Gauge className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No readings in this date range.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date / Time</th>
                <th className="text-left font-medium px-4 py-2">User</th>
                <th className="text-left font-medium px-4 py-2">Instrument</th>
                <th className="text-right font-medium px-4 py-2">Backpressure</th>
                <th className="text-right font-medium px-4 py-2">Run min / max</th>
                <th className="text-right font-medium px-4 py-2"># Inj.</th>
                <th className="text-left font-medium px-4 py-2">Mobile Phase</th>
                <th className="text-right font-medium px-4 py-2">Flow</th>
                <th className="text-right font-medium px-4 py-2">Col. Temp</th>
                <th className="text-left font-medium px-4 py-2">Column</th>
                <th className="text-left font-medium px-4 py-2">Method</th>
                <th className="text-left font-medium px-4 py-2">Notes</th>
                {isAdmin && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(r.reading_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.user_name}</td>
                  <td className="px-4 py-2">{r.instrument}</td>
                  <td className="px-4 py-2 text-right font-mono whitespace-nowrap">
                    {r.backpressure}{" "}
                    <span className="text-muted-foreground">{r.backpressure_unit}</span>
                    {r.source !== "manual" && (
                      <Badge variant="secondary" className="ml-1.5 align-middle font-sans">
                        {r.source === "live" ? "Live" : "Auto"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono whitespace-nowrap text-muted-foreground">
                    {r.pressure_run_min != null || r.pressure_run_max != null
                      ? `${r.pressure_run_min ?? "—"} / ${r.pressure_run_max ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{r.injections_count ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.mobile_phase ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-mono whitespace-nowrap">
                    {r.flow_rate != null ? (
                      <>
                        {r.flow_rate}{" "}
                        <span className="text-muted-foreground">{r.flow_rate_unit}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono whitespace-nowrap">
                    {r.column_temp != null ? (
                      <>
                        {r.column_temp}°{" "}
                        <span className="text-muted-foreground">{r.column_temp_unit}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="px-4 py-2 text-muted-foreground max-w-[14rem] truncate"
                    title={r.column_name ?? undefined}
                  >
                    {r.column_name ?? "—"}
                  </td>
                  <td
                    className="px-4 py-2 text-muted-foreground max-w-[12rem] truncate"
                    title={r.acquisition_method ?? undefined}
                  >
                    {r.acquisition_method ?? "—"}
                  </td>
                  <td
                    className="px-4 py-2 text-muted-foreground max-w-[16rem] truncate"
                    title={r.notes ?? undefined}
                  >
                    {r.notes ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        disabled={deleteLoading}
                        onClick={() => {
                          if (confirm("Delete this reading?")) onDelete(r.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

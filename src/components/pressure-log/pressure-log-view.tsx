import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  listInstrumentLiveOverview,
  listInstrumentPressureLog,
  type InstrumentPressureLogRow,
} from "@/lib/instrument-feed.functions";
import { qk } from "@/lib/query-keys";
import { PressureLogChart } from "./pressure-log-chart";
import { PressureLogTable } from "./pressure-log-table";

const PAGE_SIZE = 100;
type StateFilter = "all" | "running" | "idle";

function defaultRange(): DateRange {
  const to = new Date();
  return { from: startOfDay(addDays(to, -6)), to };
}

function rangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Pick a date range";
  if (range.to && range.to.getTime() !== range.from.getTime())
    return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
  return format(range.from, "MMM d, yyyy");
}

function toCsv(rows: InstrumentPressureLogRow[], names: Map<string, string>): string {
  const head = [
    "logged_at",
    "instrument",
    "state",
    "pressure_bar",
    "pressure_min_bar",
    "pressure_max_bar",
    "flow_ml_min",
    "column_temp_c",
    "samples",
    "window_s",
    "run_id",
  ];
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.logged_at,
      names.get(r.instrument_id) ?? r.instrument_id,
      r.state,
      r.pressure_bar,
      r.pressure_min_bar,
      r.pressure_max_bar,
      r.flow_ml_min,
      r.column_temp_c,
      r.samples,
      r.window_s,
      r.run_id,
    ]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PressureLogView() {
  const overviewFn = useServerFn(listInstrumentLiveOverview);
  const { data: overview = [] } = useQuery({
    queryKey: qk.instrumentFeed.overview(),
    queryFn: () => overviewFn(),
  });
  const instrumentNames = useMemo(
    () => new Map(overview.map((o) => [o.instrument.id, o.instrument.name] as const)),
    [overview],
  );

  const [instrumentId, setInstrumentId] = useState("__all__");
  const [range, setRange] = useState<DateRange | undefined>(defaultRange);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [pumpOnly, setPumpOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false);

  const filters = useMemo(() => {
    if (!range?.from) return null;
    return {
      instrument_id: instrumentId === "__all__" ? null : instrumentId,
      from: startOfDay(range.from).toISOString(),
      to: startOfDay(addDays(range.to ?? range.from, 1)).toISOString(),
      state: stateFilter === "all" ? null : stateFilter,
      pump_on_only: pumpOnly,
    };
  }, [instrumentId, range, stateFilter, pumpOnly]);

  const listFn = useServerFn(listInstrumentPressureLog);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk.instrumentFeed.pressureLog(filters),
    queryFn: () => {
      if (!filters) throw new Error("Pick a date range");
      return listFn({ data: filters });
    },
    enabled: filters !== null,
    refetchInterval: 60_000,
  });
  /** newest first, as returned */
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const chronological = useMemo(() => [...rows].reverse(), [rows]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let flowSum = 0;
    let flowN = 0;
    for (const r of rows) {
      sum += r.pressure_bar;
      lo = Math.min(lo, r.pressure_min_bar ?? r.pressure_bar);
      hi = Math.max(hi, r.pressure_max_bar ?? r.pressure_bar);
      if (r.flow_ml_min != null) {
        flowSum += r.flow_ml_min;
        flowN++;
      }
    }
    return {
      count: rows.length,
      mean: sum / rows.length,
      min: lo,
      max: hi,
      meanFlow: flowN ? flowSum / flowN : null,
      first: rows[rows.length - 1].logged_at,
      last: rows[0].logged_at,
    };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showInstrument = instrumentId === "__all__";

  // Print: mount the full filtered table (hidden on screen), print, unmount.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const id = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  function exportCsv() {
    const from = filters ? filters.from.slice(0, 10) : "";
    const to = range?.to ? format(range.to, "yyyy-MM-dd") : from;
    downloadText(
      `pressure-log_${from}_${to}.csv`,
      toCsv(chronological, instrumentNames),
      "text/csv;charset=utf-8",
    );
  }

  const filterSummary = [
    `Instrument: ${showInstrument ? "all" : (instrumentNames.get(instrumentId) ?? instrumentId)}`,
    `Range: ${rangeLabel(range)}`,
    `State: ${stateFilter}`,
    pumpOnly ? "Pump delivering only" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <div className="space-y-4 print-hide">
        <Card>
          <CardContent className="pt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Instrument</Label>
              <Select
                value={instrumentId}
                onValueChange={(v) => {
                  setInstrumentId(v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="All instruments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instruments</SelectItem>
                  {overview.map((o) => (
                    <SelectItem key={o.instrument.id} value={o.instrument.id}>
                      {o.instrument.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date range</Label>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 justify-start text-left font-normal",
                        !range && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4" />
                      {rangeLabel(range)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={(r) => {
                        setRange(r);
                        setPage(0);
                      }}
                      numberOfMonths={2}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">State</Label>
              <Select
                value={stateFilter}
                onValueChange={(v) => {
                  setStateFilter(v as StateFilter);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Running + idle</SelectItem>
                  <SelectItem value="running">Running only</SelectItem>
                  <SelectItem value="idle">Idle only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 h-9">
              <Checkbox
                id="pressure-log-pump-only"
                checked={pumpOnly}
                onCheckedChange={(v) => {
                  setPumpOnly(v === true);
                  setPage(0);
                }}
              />
              <Label
                htmlFor="pressure-log-pump-only"
                className="text-xs font-normal cursor-pointer"
              >
                Pump delivering only
              </Label>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={rows.length === 0 || printing}
                onClick={() => setPrinting(true)}
              >
                <Printer className="size-4" /> Print
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {summary ? (
            <>
              <span>
                <span className="text-foreground tabular-nums">{summary.count}</span> entries
              </span>
              <span>
                mean <span className="text-foreground tabular-nums">{summary.mean.toFixed(1)}</span>{" "}
                bar
              </span>
              <span>
                min / max{" "}
                <span className="text-foreground tabular-nums">
                  {summary.min.toFixed(1)} / {summary.max.toFixed(1)}
                </span>{" "}
                bar
              </span>
              {summary.meanFlow != null && (
                <span>
                  mean flow{" "}
                  <span className="text-foreground tabular-nums">
                    {summary.meanFlow.toFixed(3)}
                  </span>{" "}
                  mL/min
                </span>
              )}
              <span>
                {format(new Date(summary.first), "MMM d HH:mm")} –{" "}
                {format(new Date(summary.last), "MMM d HH:mm")}
              </span>
              {data?.truncated && (
                <span className="text-destructive">
                  Showing the newest 20,000 entries only — narrow the range for the rest.
                </span>
              )}
            </>
          ) : isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>No entries match these filters.</span>
          )}
          {isFetching && !isLoading && <span>Refreshing…</span>}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pressure</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : rows.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                No log entries in this range. The agent writes one entry per minute whenever the
                instrument is on.
              </div>
            ) : (
              <PressureLogChart rows={chronological} instrumentNames={instrumentNames} />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Entries
            </div>
            {rows.length > PAGE_SIZE && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="tabular-nums">
                  Page {page + 1} of {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={page >= pageCount - 1}
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
            <div className="p-8 text-sm text-muted-foreground text-center">No entries.</div>
          ) : (
            <div className="overflow-x-auto">
              <PressureLogTable
                rows={pageRows}
                instrumentNames={instrumentNames}
                showInstrument={showInstrument}
              />
            </div>
          )}
        </Card>
      </div>

      {printing && (
        <div className="print-area hidden">
          <h1 className="text-lg font-bold">Instrument Pressure Log</h1>
          <div className="text-xs mb-2">
            {filterSummary} · Printed {format(new Date(), "MMM d, yyyy HH:mm")}
          </div>
          {summary && (
            <div className="text-xs mb-3">
              {summary.count} entries · mean {summary.mean.toFixed(1)} bar · min / max{" "}
              {summary.min.toFixed(1)} / {summary.max.toFixed(1)} bar
              {summary.meanFlow != null ? ` · mean flow ${summary.meanFlow.toFixed(3)} mL/min` : ""}
            </div>
          )}
          <PressureLogTable
            rows={chronological}
            instrumentNames={instrumentNames}
            showInstrument={showInstrument}
            forPrint
          />
        </div>
      )}
    </div>
  );
}

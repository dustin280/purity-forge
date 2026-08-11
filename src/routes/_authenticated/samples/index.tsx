import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listSamples } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { toDisplayStatus, type SampleStatus } from "@/lib/lims-utils";
import { SamplesFiltersCard, type SampleStatusFilter } from "@/components/samples/filters-card";
import { SamplesTable, type SamplesSortKey, type SortDir } from "@/components/samples/samples-table";
export const Route = createFileRoute("/_authenticated/samples/")({ component: SamplesList });

const DEFAULT_SORT_DIR: Record<SamplesSortKey, SortDir> = {
  batch_id: "asc", compound: "asc", client: "asc", receipt_date: "desc", status: "asc",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function compareRows(
  a: { batch_id: string; compound?: string | null; client: string; receipt_date: string; status: string },
  b: { batch_id: string; compound?: string | null; client: string; receipt_date: string; status: string },
  key: SamplesSortKey,
): number {
  const av = key === "compound" ? a.compound ?? "" : (a as unknown as Record<string, string>)[key];
  const bv = key === "compound" ? b.compound ?? "" : (b as unknown as Record<string, string>)[key];
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

function SamplesList() {
  const fn = useServerFn(listSamples);
  const { data, isLoading } = useQuery({ queryKey: qk.samples.list(), queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SampleStatusFilter>("all");
  const [prepOnly, setPrepOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SamplesSortKey>("receipt_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);

  function handleSort(key: SamplesSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
    setPage(1);
  }

  const filtered = (data ?? []).filter(s => {
    if (filter !== "all" && toDisplayStatus(s.status as SampleStatus) !== filter) return false;
    if (prepOnly && !(s as { prep_flag?: boolean | null }).prep_flag) return false;
    if (q && !`${s.batch_id} ${s.client} ${s.project ?? ""} ${(s as { compound?: string | null }).compound ?? ""} ${(s as { lot?: string | null }).lot ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  // Checking a prep-flag box mutates only that row's flag in the query
  // cache (see SamplesTable) — it never touches q/filter/sortKey/page, so
  // this sort/slice never reruns because of a checkbox click, only because
  // of an actual sort/filter/page change.
  const sorted = useMemo(() => {
    const arr = [...filtered].sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      return a.id.localeCompare(b.id); // stable tiebreaker for equal sort values
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Specimen Registry</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Samples</h1>
        </div>
        <Button asChild><Link to="/samples/new"><Plus className="size-4 mr-1" />New Sample</Link></Button>
      </div>

      <SamplesFiltersCard q={q} setQ={(v) => { setQ(v); setPage(1); }} filter={filter} setFilter={(v) => { setFilter(v); setPage(1); }} prepOnly={prepOnly} setPrepOnly={(v) => { setPrepOnly(v); setPage(1); }} />

      <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
        <div className="text-muted-foreground">
          {sorted.length} sample{sorted.length === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SamplesTable rows={paged} isLoading={isLoading} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline" size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4 mr-1" />Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <Button
            variant="outline" size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next<ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

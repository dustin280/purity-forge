import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { STATUS_LABEL, type SampleStatus } from "@/lib/lims-utils";

export type SampleStatusFilter = SampleStatus | "all";

/**
 * Search + status filter card for the Samples list. Purely presentational —
 * parent owns the filter state.
 */
export function SamplesFiltersCard({
  q, setQ, filter, setFilter, prepOnly, setPrepOnly,
}: {
  q: string;
  setQ: (v: string) => void;
  filter: SampleStatusFilter;
  setFilter: (v: SampleStatusFilter) => void;
  prepOnly?: boolean;
  setPrepOnly?: (v: boolean) => void;
}) {
  return (
    <Card className="p-4 border-border">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search Sample ID, client, compound…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 text-xs">
          {(["all", ...Object.keys(STATUS_LABEL)] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as SampleStatusFilter)}
              className={`px-3 py-1.5 rounded-md border transition-colors uppercase tracking-wider font-semibold ${
                filter === f ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
              }`}
            >
              {f === "all" ? "All" : STATUS_LABEL[f as SampleStatus]}
            </button>
          ))}
          {setPrepOnly && (
            <button
              onClick={() => setPrepOnly(!prepOnly)}
              className={`px-3 py-1.5 rounded-md border transition-colors uppercase tracking-wider font-semibold ${
                prepOnly ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Prep Flagged
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
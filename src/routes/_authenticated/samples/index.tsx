import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listSamples } from "@/lib/lims.functions";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { SamplesFiltersCard, type SampleStatusFilter } from "@/components/samples/filters-card";
import { SamplesTable } from "@/components/samples/samples-table";
export const Route = createFileRoute("/_authenticated/samples/")({ component: SamplesList });

function SamplesList() {
  const fn = useServerFn(listSamples);
  const { data, isLoading } = useQuery({ queryKey: qk.samples.list(), queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SampleStatusFilter>("all");

  const filtered = (data ?? []).filter(s => {
    if (filter !== "all" && s.status !== filter) return false;
    if (q && !`${s.batch_id} ${s.client} ${s.project ?? ""} ${(s as { compound?: string | null }).compound ?? ""} ${(s as { lot?: string | null }).lot ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Specimen Registry</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Samples</h1>
        </div>
        <Button asChild><Link to="/samples/new"><Plus className="size-4 mr-1" />New Sample</Link></Button>
      </div>

      <SamplesFiltersCard q={q} setQ={setQ} filter={filter} setFilter={setFilter} />
      <SamplesTable rows={filtered} isLoading={isLoading} />
    </div>
  );
}
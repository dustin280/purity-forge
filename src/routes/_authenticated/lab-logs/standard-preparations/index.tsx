import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listStandardPreparations, PREP_STATUSES } from "@/lib/standard-preparations.functions";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { PrepsFiltersCard } from "@/components/standard-preparations/preps-filters-card";
import { PrepsList } from "@/components/standard-preparations/preps-list";
export const Route = createFileRoute("/_authenticated/lab-logs/standard-preparations/")({
  component: StandardPrepsIndex,
});

function StandardPrepsIndex() {
  const list = useServerFn(listStandardPreparations);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(() => ({
    q: q || null,
    status: status === "all" ? null : (status as typeof PREP_STATUSES[number]),
    from: from || null,
    to: to || null,
  }), [q, status, from, to]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.standardPreps.list(filters),
    queryFn: () => list({ data: filters }),
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link to="/lab-logs"><Button variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft className="size-4 mr-1" /> Back to Logs</Button></Link>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Logs</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Standard Preparation Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Reference standards, system suitability, check standards, working solutions.</p>
        </div>
        <Link to="/lab-logs/standard-preparations/new"><Button><Plus className="size-4 mr-1" /> New Preparation</Button></Link>
      </div>

      <PrepsFiltersCard q={q} setQ={setQ} status={status} setStatus={setStatus} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <PrepsList rows={rows} isLoading={isLoading} />
    </div>
  );
}
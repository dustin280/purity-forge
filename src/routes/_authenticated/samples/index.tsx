import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listSamples } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/lims/status-pill";
import { STATUS_LABEL, type SampleStatus } from "@/lib/lims-utils";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/samples/")({ component: SamplesList });

function SamplesList() {
  const fn = useServerFn(listSamples);
  const { data, isLoading } = useQuery({ queryKey: ["samples"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SampleStatus | "all">("all");

  const filtered = (data ?? []).filter(s => {
    if (filter !== "all" && s.status !== filter) return false;
    if (q && !`${s.batch_id} ${s.client} ${s.project ?? ""} ${(s as { compound?: string | null }).compound ?? ""} ${(s as { lot?: string | null }).lot ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Specimen Registry</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Samples</h1>
        </div>
        <Button asChild><Link to="/samples/new"><Plus className="size-4 mr-1" />New Sample</Link></Button>
      </div>

      <Card className="p-4 border-border">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search Sample ID, client, compound…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1.5 text-xs">
            {(["all", ...Object.keys(STATUS_LABEL)] as const).map(f => (
              <button key={f} onClick={() => setFilter(f as SampleStatus | "all")}
                className={`px-3 py-1.5 rounded-md border transition-colors uppercase tracking-wider font-semibold ${
                  filter === f ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
                }`}>{f === "all" ? "All" : STATUS_LABEL[f as SampleStatus]}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Sample ID</th>
              <th className="text-left px-4 py-3 font-semibold">Compound / Lot</th>
              <th className="text-left px-4 py-3 font-semibold">Client / Project</th>
              <th className="text-left px-4 py-3 font-semibold">Received</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No samples match.</td></tr>
            )}
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3">
                  <Link to="/samples/$batchId" params={{ batchId: s.batch_id }}
                    className="font-mono font-semibold text-primary hover:underline">{s.batch_id}</Link>
                </td>
                <td className="px-4 py-3">
                  <div>{(s as { compound?: string | null }).compound ?? "—"}</div>
                  {(s as { lot?: string | null }).lot && (
                    <div className="text-xs text-muted-foreground font-mono">Lot {(s as { lot?: string | null }).lot}</div>
                  )}
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
    </div>
  );
}
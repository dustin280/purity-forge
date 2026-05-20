import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listStandardPreparations, PREP_STATUSES } from "@/lib/standard-preparations.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronRight, ArrowLeft, FlaskConical } from "lucide-react";

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
    queryKey: ["standard-preparations", filters],
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

      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Search</label>
            <Input placeholder="Log #, standard, analyst, lot…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {PREP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <FlaskConical className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No preparation logs yet.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <Link key={r.id} to="/lab-logs/standard-preparations/$id" params={{ id: r.id }} className="block">
              <Card className="p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{r.log_number}</span>
                      {r.syn_id && <span className="font-mono text-xs text-muted-foreground">{r.syn_id}</span>}
                      <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>{r.status}</Badge>
                    </div>
                    <div className="font-medium mt-1 truncate">{r.standard_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {r.analyst_name} · {new Date(r.prepared_at).toLocaleString()}
                      {r.target_concentration ? ` · ${r.target_concentration}` : ""}
                      {r.manufacturer_lot ? ` · Lot ${r.manufacturer_lot}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
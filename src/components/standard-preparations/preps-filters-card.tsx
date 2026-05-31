import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PREP_STATUSES } from "@/lib/standard-preparations.functions";
import { STATUS_LABEL } from "@/lib/lims-utils";

interface Props {
  q: string; setQ: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  analyst: string; setAnalyst: (v: string) => void;
}

export function PrepsFiltersCard({ q, setQ, status, setStatus, from, setFrom, to, setTo, analyst, setAnalyst }: Props) {
  return (
    <Card className="p-4 mb-4">
      <div className="grid md:grid-cols-5 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input placeholder="Log #, standard, analyst, lot…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Analyst</label>
          <Input placeholder="Filter by analyst" value={analyst} onChange={e => setAnalyst(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {PREP_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
      </div>
    </Card>
  );
}
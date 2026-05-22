import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuditFiltersCard({
  from, to, tableFilter, actorFilter, tables,
  onFrom, onTo, onTable, onActor,
}: {
  from: string;
  to: string;
  tableFilter: string;
  actorFilter: string;
  tables: string[];
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onTable: (v: string) => void;
  onActor: (v: string) => void;
}) {
  return (
    <Card className="p-4 mb-4 grid sm:grid-cols-4 gap-3">
      <div>
        <Label htmlFor="from" className="text-xs">From</Label>
        <Input id="from" type="date" value={from} onChange={e => onFrom(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="to" className="text-xs">To</Label>
        <Input id="to" type="date" value={to} onChange={e => onTo(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="table" className="text-xs">Table</Label>
        <Input id="table" placeholder="e.g. samples" value={tableFilter} onChange={e => onTable(e.target.value)} list="audit-tables" />
        <datalist id="audit-tables">
          {tables.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>
      <div>
        <Label htmlFor="actor" className="text-xs">Actor</Label>
        <Input id="actor" placeholder="name or email" value={actorFilter} onChange={e => onActor(e.target.value)} />
      </div>
    </Card>
  );
}
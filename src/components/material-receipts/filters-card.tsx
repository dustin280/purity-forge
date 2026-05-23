import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type MaterialTypeFilter = "all" | "controlled" | "uncontrolled";

interface Props {
  q: string;
  onQChange: (v: string) => void;
  materialType: MaterialTypeFilter;
  onMaterialTypeChange: (v: MaterialTypeFilter) => void;
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
}

export function ReceiptsFiltersCard({
  q, onQChange, materialType, onMaterialTypeChange,
  from, onFromChange, to, onToChange,
}: Props) {
  return (
    <Card className="p-4 mb-4">
      <div className="grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            placeholder="Receipt #, material, lot, supplier…"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Material type</label>
          <Select value={materialType} onValueChange={(v) => onMaterialTypeChange(v as MaterialTypeFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="controlled">Controlled</SelectItem>
              <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
          </div>
        </div>
      </div>
    </Card>
  );
}
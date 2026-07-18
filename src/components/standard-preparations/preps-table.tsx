import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, FlaskConical } from "lucide-react";
import { STATUS_LABEL } from "@/lib/lims-utils";
import { cn } from "@/lib/utils";

export type SortKey =
  | "syn_id"
  | "log_number"
  | "prepared_at"
  | "created_at"
  | "standard_name"
  | "analyst_name"
  | "status";
export type SortDir = "asc" | "desc";

type Row = {
  id: string;
  log_number: string;
  syn_id: string | null;
  status: string;
  standard_name: string;
  analyst_name: string;
  prepared_at: string;
  created_at: string;
  target_concentration: string | null;
  manufacturer_lot: string | null;
};

interface Props {
  rows: Row[];
  isLoading: boolean;
  sortBy: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}

const COLS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "syn_id", label: "SYX ID" },
  { key: "log_number", label: "Log #" },
  { key: "standard_name", label: "Standard" },
  { key: "analyst_name", label: "Analyst" },
  { key: "prepared_at", label: "Prepared" },
  { key: "created_at", label: "Created" },
  { key: null, label: "Conc" },
  { key: null, label: "Lot" },
  { key: "status", label: "Status" },
];

function fmt(d: string) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
}

export function PrepsTable({ rows, isLoading, sortBy, sortDir, onSort }: Props) {
  const navigate = useNavigate();
  if (isLoading) return <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>;
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <FlaskConical className="size-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">No preparation logs match these filters.</div>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {COLS.map(c => (
              <TableHead key={c.label} className={c.className}>
                {c.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(c.key!)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                      sortBy === c.key && "text-foreground font-semibold",
                    )}
                  >
                    {c.label}
                    {sortBy === c.key
                      ? (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
                      : <ChevronsUpDown className="size-3 opacity-40" />}
                  </button>
                ) : c.label}
              </TableHead>
            ))}
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow
              key={r.id}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: r.id } })}
            >
              <TableCell className="font-mono text-xs">{r.syn_id ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{r.log_number}</TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">{r.standard_name}</TableCell>
              <TableCell className="text-muted-foreground">{r.analyst_name}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{fmt(r.prepared_at)}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</TableCell>
              <TableCell className="text-muted-foreground">{r.target_concentration ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.manufacturer_lot ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={r.status === "approved" ? "default" : r.status === "reviewed" ? "secondary" : "outline"}>
                  {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}
                </Badge>
              </TableCell>
              <TableCell><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
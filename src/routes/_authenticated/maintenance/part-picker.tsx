import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadParts, type PartRow } from "@/lib/maintenance/parts";

export const Route = createFileRoute("/_authenticated/maintenance/part-picker")({ component: PartPicker });

const ALL = "__all__";

function PartPicker() {
  const parts = useMemo(() => loadParts(), []);
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>(ALL);
  const [subsystemFilter, setSubsystemFilter] = useState<string>(ALL);

  const modules = useMemo(
    () => Array.from(new Set(parts.map(p => p.module).filter(Boolean))).sort(),
    [parts],
  );
  const subsystems = useMemo(
    () => Array.from(new Set(
      parts
        .filter(p => moduleFilter === ALL || p.module === moduleFilter)
        .map(p => p.subsystem)
        .filter(Boolean),
    )).sort(),
    [parts, moduleFilter],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parts.filter(p => {
      if (moduleFilter !== ALL && p.module !== moduleFilter) return false;
      if (subsystemFilter !== ALL && p.subsystem !== subsystemFilter) return false;
      if (!needle) return true;
      return Object.values(p).some(v => v.toLowerCase().includes(needle));
    });
  }, [parts, q, moduleFilter, subsystemFilter]);

  const hasFilters = q || moduleFilter !== ALL || subsystemFilter !== ALL;
  const clear = () => { setQ(""); setModuleFilter(ALL); setSubsystemFilter(ALL); };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <Link to="/maintenance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Maintenance
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">Part Picker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Searchable catalog of Agilent instrument parts. Click the link in the “Where to Buy” column to open the Agilent product page.
        </p>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search description, part #, notes…"
              className="pl-9"
            />
          </div>
          <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); setSubsystemFilter(ALL); }}>
            <SelectTrigger><SelectValue placeholder="Module / Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modules</SelectItem>
              {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subsystemFilter} onValueChange={setSubsystemFilter}>
            <SelectTrigger><SelectValue placeholder="Subsystem / Assembly" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subsystems</SelectItem>
              {subsystems.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={clear} disabled={!hasFilters}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          Showing {filtered.length} of {parts.length} parts
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="min-w-[160px]">Module</TableHead>
                <TableHead className="min-w-[140px]">Subsystem</TableHead>
                <TableHead className="min-w-[240px]">Description</TableHead>
                <TableHead className="min-w-[130px]">Part #</TableHead>
                <TableHead className="min-w-[130px]">Replaces</TableHead>
                <TableHead className="min-w-[140px]">Status</TableHead>
                <TableHead className="min-w-[150px]">Torque / Service</TableHead>
                <TableHead className="min-w-[120px] text-right">Price</TableHead>
                <TableHead className="min-w-[90px]">eBay</TableHead>
                <TableHead className="min-w-[110px]">Where to Buy</TableHead>
                <TableHead className="min-w-[240px]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                    No parts match your filters.
                  </TableCell>
                </TableRow>
              ) : filtered.map((p, i) => <PartRowView key={`${p.partNumber}-${i}`} p={p} />)}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function PartRowView({ p }: { p: PartRow }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{p.module}</TableCell>
      <TableCell className="text-sm">{p.subsystem}</TableCell>
      <TableCell className="text-sm">{p.description}</TableCell>
      <TableCell className="text-sm font-mono">{p.partNumber}</TableCell>
      <TableCell className="text-sm font-mono text-muted-foreground">{p.replaces}</TableCell>
      <TableCell className="text-xs">{p.status}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.serviceNote}</TableCell>
      <TableCell className="text-sm font-mono text-right whitespace-nowrap">
        {p.price ? p.price : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={!p.partNumber}
          onClick={() => {
            const query = encodeURIComponent(`Agilent ${p.partNumber}`);
            window.open(`https://www.ebay.com/sch/i.html?_nkw=${query}`, "_blank", "noopener,noreferrer");
          }}
        >
          eBay <ExternalLink className="size-3 ml-1" />
        </Button>
      </TableCell>
      <TableCell>
        {p.whereToBuy && /^https?:\/\//i.test(p.whereToBuy) ? (
          <a
            href={p.whereToBuy}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
          >
            Buy <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.notes}</TableCell>
    </TableRow>
  );
}
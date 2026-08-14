import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  createHplcColumn,
  deleteHplcColumn,
  listHplcColumns,
  setInstalledColumn,
  updateHplcColumn,
} from "@/lib/hplc-columns.functions";
import { listInstruments } from "@/lib/instruments.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/hplc-columns")({
  component: HplcColumnsAdmin,
});

function HplcColumnsAdmin() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const list = useServerFn(listHplcColumns);
  const create = useServerFn(createHplcColumn);
  const update = useServerFn(updateHplcColumn);
  const del = useServerFn(deleteHplcColumn);
  const install = useServerFn(setInstalledColumn);
  const listInst = useServerFn(listInstruments);

  const { data: columns = [], isLoading } = useQuery({
    queryKey: qk.hplcColumns.list(),
    queryFn: () => list(),
  });
  const { data: instruments = [] } = useQuery({
    queryKey: qk.instruments.list(),
    queryFn: () => listInst(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.hplcColumns.list() });

  const createMut = useMutation({
    mutationFn: (d: { name: string; part_number: string | null; total_injections: number | null }) => create({ data: d }),
    onSuccess: () => { toast.success("Column added"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (d: {
      id: string;
      name?: string;
      part_number?: string | null;
      is_active?: boolean;
      rated_max_pressure_bar?: number | null;
      total_injections?: number;
    }) => update({ data: d }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const installMut = useMutation({
    mutationFn: (d: { columnId: string; instrumentId: string | null }) => install({ data: d }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [pn, setPn] = useState("");
  const [startInjections, setStartInjections] = useState("");

  if (!isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Admins only.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">HPLC Columns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the column options shown in the Daily Backpressure Log selector.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Add column</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createMut.mutate(
                {
                  name: name.trim(),
                  part_number: pn.trim() || null,
                  total_injections: startInjections === "" ? null : Number(startInjections),
                },
                { onSuccess: () => { setName(""); setPn(""); setStartInjections(""); } },
              );
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="col-name">Name</Label>
              <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ZORBAX Eclipse Plus C18 2.1x50 mm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="col-pn">Part number</Label>
              <Input id="col-pn" value={pn} onChange={(e) => setPn(e.target.value)} placeholder="optional" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="col-inj">Starting injection count</Label>
              <Input
                id="col-inj"
                type="number"
                min="0"
                step="1"
                value={startInjections}
                onChange={(e) => setStartInjections(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[160px]">Part number</TableHead>
              <TableHead className="w-[120px]">Rated max (bar)</TableHead>
              <TableHead className="w-[110px]">Injections</TableHead>
              <TableHead className="w-[180px]">Installed on</TableHead>
              <TableHead className="w-[90px]">Active</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && columns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No columns yet.</TableCell></TableRow>
            )}
            {columns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Input
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name) updateMut.mutate({ id: c.id, name: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={c.part_number ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (c.part_number ?? "")) updateMut.mutate({ id: c.id, part_number: v || null });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    defaultValue={c.rated_max_pressure_bar ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const v = raw === "" ? null : Number(raw);
                      if (v !== (c.rated_max_pressure_bar ?? null)) updateMut.mutate({ id: c.id, rated_max_pressure_bar: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={c.total_injections}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== c.total_injections) updateMut.mutate({ id: c.id, total_injections: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={c.installed_on_instrument_id ?? "__none__"}
                    onValueChange={(val) =>
                      installMut.mutate({ columnId: c.id, instrumentId: val === "__none__" ? null : val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not installed" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Not installed —</SelectItem>
                      {instruments.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={c.is_active}
                    onCheckedChange={(v) => updateMut.mutate({ id: c.id, is_active: Boolean(v) })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete column "${c.name}"?`)) deleteMut.mutate(c.id);
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
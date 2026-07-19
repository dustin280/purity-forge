import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listInstrumentInventory, updateInstrumentSettings, type InstrumentOpStatus,
} from "@/lib/instruments-inventory.functions";
import { listTrayConfigs } from "@/lib/tray-configs.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/inventory/instruments")({
  component: InstrumentsInventory,
});

const STATUS_BADGE: Record<InstrumentOpStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  maintenance: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  inactive: "bg-muted text-muted-foreground",
};

function InstrumentsInventory() {
  const qc = useQueryClient();
  const list = useServerFn(listInstrumentInventory);
  const upd = useServerFn(updateInstrumentSettings);
  const trays = useServerFn(listTrayConfigs);
  const { data } = useQuery({ queryKey: qk.instrumentInventory.list(false), queryFn: () => list({ data: {} }) });
  const { data: trayCfgs } = useQuery({ queryKey: qk.trays.list(), queryFn: () => trays() });

  const updMut = useMutation({
    mutationFn: (v: {
      id: string;
      instrument_name?: string | null;
      instrument_status?: InstrumentOpStatus | null;
      default_method_folder?: string | null;
      tray_config_id?: string | null;
    }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.instrumentInventory.all }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Inventory</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Instruments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure display name, operational status, method folder, and tray layout for the Run List Generator.
          Add new instruments from <a className="underline" href="/inventory/new">Inventory → Add</a> with category "Instrument".
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Make / Model</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Method folder</TableHead>
              <TableHead>Tray</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No instruments yet.</TableCell></TableRow>
            )}
            {(data ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell>
                  <Input
                    defaultValue={it.instrument_name ?? ""}
                    placeholder="e.g. Agilent 1290 #1"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (it.instrument_name ?? null)) updMut.mutate({ id: it.id, instrument_name: v });
                    }}
                  />
                </TableCell>
                <TableCell className="text-xs">{[it.make, it.model].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{it.serial_number || "—"}</TableCell>
                <TableCell>
                  <Select
                    value={it.instrument_status ?? "inactive"}
                    onValueChange={(v) => updMut.mutate({ id: it.id, instrument_status: v as InstrumentOpStatus })}
                  >
                    <SelectTrigger className={`text-xs ${STATUS_BADGE[(it.instrument_status ?? "inactive") as InstrumentOpStatus]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={it.default_method_folder ?? ""}
                    placeholder="Optional override"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (it.default_method_folder ?? null)) updMut.mutate({ id: it.id, default_method_folder: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={it.tray_config_id ?? ""}
                    onValueChange={(v) => updMut.mutate({ id: it.id, tray_config_id: v || null })}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {(trayCfgs ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
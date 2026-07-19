import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  listTrayConfigs, getTrayConfig, updateTrayPositionStatus, createTrayConfig,
  type TrayPositionStatus,
} from "@/lib/tray-configs.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/trays")({
  component: TraysAdmin,
});

const STATUS_COLOR: Record<TrayPositionStatus, string> = {
  available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  reserved: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  out_of_service: "bg-destructive/15 text-destructive border-destructive/30",
};
const STATUS_ROTATION: Record<TrayPositionStatus, TrayPositionStatus> = {
  available: "reserved",
  reserved: "out_of_service",
  out_of_service: "available",
};

function TraysAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listTrayConfigs);
  const get = useServerFn(getTrayConfig);
  const upd = useServerFn(updateTrayPositionStatus);
  const create = useServerFn(createTrayConfig);
  const { data: cfgs } = useQuery({ queryKey: qk.trays.list(), queryFn: () => list() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? cfgs?.[0]?.id ?? null;
  const { data: detail } = useQuery({
    queryKey: qk.trays.detail(activeId ?? ""),
    queryFn: () => get({ data: { id: activeId! } }),
    enabled: !!activeId,
  });
  const [newName, setNewName] = useState("");
  const createMut = useMutation({
    mutationFn: () => create({ data: { name: newName.trim(), notes: null } }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: qk.trays.all }); setSelectedId(c.id); setNewName(""); toast.success("Tray created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updMut = useMutation({
    mutationFn: (v: { id: string; status: TrayPositionStatus }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.trays.detail(activeId ?? "") }),
  });

  if (role !== "admin") return <div className="p-6 text-sm text-muted-foreground">Admin only.</div>;

  const positions = detail?.positions ?? [];
  const drawers = Array.from(new Set(positions.filter((p) => !p.is_ref_vial).map((p) => p.drawer ?? "?")));
  const refs = positions.filter((p) => p.is_ref_vial);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Multisampler Trays</h1>
        <p className="text-sm text-muted-foreground mt-1">Click a position to cycle Available → Reserved → Out of service.</p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-64">
          <Label className="text-xs">Tray configuration</Label>
          <Select value={activeId ?? ""} onValueChange={(v) => setSelectedId(v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {(cfgs ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_default ? " (default)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-64">
          <Label className="text-xs">New tray name</Label>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tray Setup B" />
            <Button disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>Create</Button>
          </div>
        </div>
      </Card>

      {refs.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Reference vials</div>
          <div className="flex flex-wrap gap-2">
            {refs.map((p) => (
              <button key={p.id} type="button" onClick={() => updMut.mutate({ id: p.id, status: STATUS_ROTATION[p.status] })}
                className={`px-3 py-1 rounded text-xs border ${STATUS_COLOR[p.status]}`}>
                {p.position_code}
              </button>
            ))}
          </div>
        </Card>
      )}

      {drawers.map((d) => (
        <Card key={d} className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Drawer {d}</div>
          <div className="grid grid-cols-9 gap-1.5">
            {positions.filter((p) => p.drawer === d && !p.is_ref_vial).map((p) => (
              <button key={p.id} type="button"
                onClick={() => updMut.mutate({ id: p.id, status: STATUS_ROTATION[p.status] })}
                className={`h-8 rounded text-[10px] font-mono border ${STATUS_COLOR[p.status]}`}
                title={`${p.position_code} — ${p.status}`}>
                {p.row_label}{p.col_num}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
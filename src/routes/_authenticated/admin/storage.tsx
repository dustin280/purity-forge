import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { qk } from "@/lib/query-keys";
import {
  listStorageUnits, getStorageUnit, createStorageUnit, updateStorageUnit,
  addStorageUnitTrays, updateStorageSlotStatus,
  type StorageUnitType, type StorageSlotStatus,
} from "@/lib/storage-units.functions";

export const Route = createFileRoute("/_authenticated/admin/storage")({
  component: StorageAdmin,
});

const UNIT_TYPE_LABEL: Record<StorageUnitType, string> = {
  fridge: "Fridge", freezer: "Freezer", incubator: "Incubator", autoclave: "Autoclave",
};

const STATUS_COLOR: Record<StorageSlotStatus, string> = {
  available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  occupied: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  out_of_service: "bg-destructive/15 text-destructive border-destructive/30",
};
const STATUS_ROTATION: Record<StorageSlotStatus, StorageSlotStatus> = {
  available: "occupied",
  occupied: "out_of_service",
  out_of_service: "available",
};

function StorageAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listStorageUnits);
  const get = useServerFn(getStorageUnit);
  const create = useServerFn(createStorageUnit);
  const update = useServerFn(updateStorageUnit);
  const addTrays = useServerFn(addStorageUnitTrays);
  const updSlot = useServerFn(updateStorageSlotStatus);

  const { data: units } = useQuery({ queryKey: qk.storageUnits.list(), queryFn: () => list() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? units?.[0]?.id ?? null;
  const { data: detail } = useQuery({
    queryKey: qk.storageUnits.detail(activeId ?? ""),
    queryFn: () => get({ data: { id: activeId! } }),
    enabled: !!activeId,
  });

  const [newType, setNewType] = useState<StorageUnitType>("fridge");
  const [newName, setNewName] = useState("");
  const [newTrayCount, setNewTrayCount] = useState("6");
  const createMut = useMutation({
    mutationFn: () => create({
      data: {
        unit_type: newType,
        name: newName.trim(),
        tray_count: newType === "autoclave" ? null : Number(newTrayCount),
      },
    }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: qk.storageUnits.all });
      setSelectedId(u.id);
      setNewName("");
      toast.success(`${UNIT_TYPE_LABEL[u.unit_type]} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updSlotMut = useMutation({
    mutationFn: (v: { id: string; status: StorageSlotStatus }) => updSlot({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.storageUnits.detail(activeId ?? "") }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [addCount, setAddCount] = useState("1");
  const addTraysMut = useMutation({
    mutationFn: () => addTrays({ data: { unit_id: activeId!, count: Number(addCount) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.storageUnits.all });
      qc.invalidateQueries({ queryKey: qk.storageUnits.detail(activeId ?? "") });
      toast.success("Trays added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [tempDraft, setTempDraft] = useState<string | null>(null);
  const updUnitMut = useMutation({
    mutationFn: (patch: { notes?: string; target_temperature_c?: number | null }) =>
      update({ data: { id: activeId!, ...patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.storageUnits.detail(activeId ?? "") });
      setNotesDraft(null);
      setTempDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") return <div className="p-6 text-sm text-muted-foreground">Admin only.</div>;

  const unit = detail?.unit;
  const slots = detail?.slots ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Storage & Equipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fridges, freezers, and incubators hold samples in trays — click a tray to cycle Available → Occupied →
          Out of service. Autoclaves are tracked as equipment only, with no trays.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-56">
          <Label className="text-xs">Unit</Label>
          <Select value={activeId ?? ""} onValueChange={(v) => setSelectedId(v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {(units ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {UNIT_TYPE_LABEL[u.unit_type]} — {u.name}{!u.is_active ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Label className="text-xs">New unit type</Label>
          <Select value={newType} onValueChange={(v) => setNewType(v as StorageUnitType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(UNIT_TYPE_LABEL) as StorageUnitType[]).map((t) => (
                <SelectItem key={t} value={t}>{UNIT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {newType !== "autoclave" && (
          <div className="w-28">
            <Label className="text-xs">Trays</Label>
            <Input type="number" min={1} value={newTrayCount} onChange={(e) => setNewTrayCount(e.target.value)} />
          </div>
        )}
        <div className="flex-1 min-w-56">
          <Label className="text-xs">Name</Label>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Freezer #2" />
            <Button disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>Create</Button>
          </div>
        </div>
      </Card>

      {unit && (
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{UNIT_TYPE_LABEL[unit.unit_type]}</div>
              <div className="text-lg font-semibold">{unit.name}</div>
              {(unit.manufacturer || unit.model || unit.serial_number) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[unit.manufacturer, unit.model, unit.serial_number].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            {unit.unit_type !== "autoclave" && (
              <div className="flex items-end gap-2">
                <div className="w-20">
                  <Label className="text-xs">Add trays</Label>
                  <Input type="number" min={1} value={addCount} onChange={(e) => setAddCount(e.target.value)} className="h-8" />
                </div>
                <Button size="sm" variant="outline" disabled={addTraysMut.isPending} onClick={() => addTraysMut.mutate()}>
                  Add
                </Button>
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                defaultValue={unit.notes ?? ""}
                key={unit.id + "-notes"}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => { if (notesDraft !== null && notesDraft !== unit.notes) updUnitMut.mutate({ notes: notesDraft }); }}
              />
            </div>
            <div>
              <Label className="text-xs">Target Temp (°C)</Label>
              <Input
                type="number" step="0.1"
                defaultValue={unit.target_temperature_c ?? ""}
                key={unit.id + "-temp"}
                onChange={(e) => setTempDraft(e.target.value)}
                onBlur={() => {
                  if (tempDraft === null) return;
                  const n = tempDraft.trim() === "" ? null : Number(tempDraft);
                  if (n !== unit.target_temperature_c) updUnitMut.mutate({ target_temperature_c: n });
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Used as the default reading wherever this unit is selected (e.g. Analysis Batches).
              </p>
            </div>
          </div>
        </Card>
      )}

      {unit && unit.unit_type !== "autoclave" && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Trays</div>
          {slots.length === 0 ? (
            <div className="text-sm text-muted-foreground">No trays yet — add some above.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => updSlotMut.mutate({ id: s.id, status: STATUS_ROTATION[s.status] })}
                  className={`h-14 rounded text-xs font-mono border flex flex-col items-center justify-center gap-0.5 ${STATUS_COLOR[s.status]}`}
                  title={`${s.label} — ${s.status}`}
                >
                  <span>{s.label}</span>
                  <span className="text-[9px] uppercase opacity-80">{s.status.replace("_", " ")}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Occupied trays are also visible from the sample's Info tab. See the{" "}
            <Link to="/lab-logs/sample-disposal" className="underline">Sample Disposal Log</Link> for full location history.
          </p>
        </Card>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrepPreview } from "./prep-preview";
import { buildPreparation, validateSide, type PrepSide } from "@/lib/mobile-phase-instructions";
import type { CreatePrepPayload } from "./use-mobile-phase";
import type { MobilePhaseReagentRow } from "@/lib/mobile-phase.functions";
import { toast } from "sonner";

const NONE = "__none__";

function emptySide(): PrepSide {
  return { enabled: true, solvent: "", solvent_pct: 95, modifier: null, modifier_pct: 0, diluent: "", notes: "" };
}

function SideCard({
  label,
  side,
  reagents,
  onChange,
}: {
  label: "A" | "B";
  side: PrepSide;
  reagents: MobilePhaseReagentRow[];
  onChange: (s: PrepSide) => void;
}) {
  const solvents = reagents.filter((r) => r.is_active && r.kinds.includes("solvent"));
  const diluents = reagents.filter((r) => r.is_active && r.kinds.includes("diluent"));
  const modifiers = reagents.filter((r) => r.is_active && r.kinds.includes("modifier"));
  const diluentPct = Math.max(0, 100 - (side.solvent_pct || 0) - (side.modifier_pct || 0));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Mobile Phase {label}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Prepare</span>
          <Switch checked={side.enabled} onCheckedChange={(v) => onChange({ ...side, enabled: v })} />
        </div>
      </div>

      {side.enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Solvent</Label>
              <Select value={side.solvent} onValueChange={(v) => onChange({ ...side, solvent: v })}>
                <SelectTrigger><SelectValue placeholder="Select solvent" /></SelectTrigger>
                <SelectContent>
                  {solvents.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Solvent %</Label>
              <Input
                type="number" min={0} max={100} step="0.1"
                value={side.solvent_pct}
                onChange={(e) => onChange({ ...side, solvent_pct: Number(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-1">
              <Label>Diluent</Label>
              <Select value={side.diluent} onValueChange={(v) => onChange({ ...side, diluent: v })}>
                <SelectTrigger><SelectValue placeholder="Select diluent" /></SelectTrigger>
                <SelectContent>
                  {diluents.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Diluent % (auto)</Label>
              <Input value={diluentPct.toFixed(2)} disabled />
            </div>

            <div className="space-y-1">
              <Label>Modifier</Label>
              <Select
                value={side.modifier ?? NONE}
                onValueChange={(v) => onChange({ ...side, modifier: v === NONE ? null : v, modifier_pct: v === NONE ? 0 : side.modifier_pct })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>(none)</SelectItem>
                  {modifiers.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Modifier %</Label>
              <Input
                type="number" min={0} max={100} step="0.01"
                value={side.modifier_pct}
                disabled={!side.modifier}
                onChange={(e) => onChange({ ...side, modifier_pct: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={side.notes ?? ""}
              onChange={(e) => onChange({ ...side, notes: e.target.value })}
            />
          </div>
        </>
      )}
    </Card>
  );
}

export function PrepForm({
  defaultUserName,
  defaultInitials,
  reagents,
  loading,
  onSubmit,
}: {
  defaultUserName: string;
  defaultInitials: string;
  reagents: MobilePhaseReagentRow[];
  loading: boolean;
  onSubmit: (p: CreatePrepPayload) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultLot = `MP-${today.replace(/-/g, "")}`;

  const [preparedAt, setPreparedAt] = useState(today);
  const [userName, setUserName] = useState(defaultUserName);
  const [initials, setInitials] = useState(defaultInitials);
  const [lotNumber, setLotNumber] = useState(defaultLot);
  const [totalVolume, setTotalVolume] = useState(1000);
  const [unit, setUnit] = useState<"mL" | "L">("mL");
  const [prepA, setPrepA] = useState<PrepSide>(emptySide());
  const [prepB, setPrepB] = useState<PrepSide>({ ...emptySide(), solvent_pct: 5 });

  const preview = useMemo(
    () =>
      buildPreparation({
        lot_number: lotNumber,
        prepared_at: preparedAt,
        user_initials: initials,
        user_name: userName,
        total_volume: totalVolume,
        total_volume_unit: unit,
        prep_a: prepA,
        prep_b: prepB,
      }),
    [lotNumber, preparedAt, initials, userName, totalVolume, unit, prepA, prepB],
  );

  function submit() {
    if (!prepA.enabled && !prepB.enabled) {
      toast.error("Enable at least one of Mobile Phase A or B");
      return;
    }
    const aErr = validateSide(prepA);
    if (aErr) return toast.error(`A: ${aErr}`);
    const bErr = validateSide(prepB);
    if (bErr) return toast.error(`B: ${bErr}`);
    if (!initials.trim()) return toast.error("User initials required");
    if (!lotNumber.trim()) return toast.error("Lot/tracking number required");
    if (!(totalVolume > 0)) return toast.error("Total volume must be > 0");

    onSubmit({
      prepared_at: new Date(preparedAt).toISOString(),
      user_name: userName || initials,
      user_initials: initials.trim().toUpperCase(),
      lot_number: lotNumber.trim(),
      total_volume: totalVolume,
      total_volume_unit: unit,
      prep_a: prepA,
      prep_b: prepB,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Date prepared</Label>
            <Input type="date" value={preparedAt} onChange={(e) => setPreparedAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>User initials</Label>
            <Input
              maxLength={8}
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              placeholder="JS"
            />
          </div>
          <div className="space-y-1">
            <Label>Total volume</Label>
            <div className="flex gap-2">
              <Input
                type="number" min={0} step="1"
                value={totalVolume}
                onChange={(e) => setTotalVolume(Number(e.target.value) || 0)}
              />
              <Select value={unit} onValueChange={(v) => setUnit(v as "mL" | "L")}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mL">mL</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Lot / tracking number</Label>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SideCard label="A" side={prepA} reagents={reagents} onChange={setPrepA} />
        <SideCard label="B" side={prepB} reagents={reagents} onChange={setPrepB} />
      </div>

      <PrepPreview text={preview} />

      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={loading}>
          {loading ? "Saving…" : "Save preparation"}
        </Button>
      </div>
    </div>
  );
}
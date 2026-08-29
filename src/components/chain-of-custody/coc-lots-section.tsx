/**
 * "Lots & Vials" section of the CoC form -- level 2 and 3 of the intake
 * hierarchy. Replaces the old flat one-row-per-sample list: a lot is
 * entered once and its vials nest inside it, so appearance/compounds/
 * masses/vial size stop being retyped per vial.
 */
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LotCard } from "./lot-card";
import { emptyLot, type LotRow } from "./types";
import type { CompoundOption } from "@/components/compounds/compound-picker";

export function CocLotsSection({
  recordId,
  shipmentId,
  lots,
  setLotsDirty,
  compoundOptions,
  onCreateCompound,
}: {
  recordId: string | null;
  shipmentId: string;
  lots: LotRow[];
  setLotsDirty: (updater: (prev: LotRow[]) => LotRow[]) => void;
  compoundOptions: CompoundOption[];
  onCreateCompound: (name: string) => Promise<CompoundOption>;
}) {
  const addLot = () => setLotsDirty((prev) => [...prev, emptyLot()]);
  const totalVials = lots.reduce((n, l) => n + l.vials.length, 0);

  return (
    <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <Label className="text-sm font-semibold">Lots &amp; Vials</Label>
          <p className="text-xs text-muted-foreground">
            One card per product/lot. Everything on the card applies to every vial inside it.
            {totalVials > 0 && ` · ${lots.length} lot${lots.length === 1 ? "" : "s"}, ${totalVials} vial${totalVials === 1 ? "" : "s"} total`}
          </p>
        </div>
        {!recordId && (
          <Button type="button" size="sm" variant="outline" onClick={addLot}>
            <Plus className="size-3.5 mr-1" /> Add lot
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {lots.map((lot, idx) => (
          <LotCard
            key={idx}
            lot={lot}
            lotNo={idx + 1}
            shipmentId={shipmentId || "SYX-……"}
            disabled={!!recordId}
            compoundOptions={compoundOptions}
            onCreateCompound={onCreateCompound}
            canRemove={lots.length > 1}
            onChange={(patch) => setLotsDirty((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
            onRemove={() => setLotsDirty((prev) => prev.filter((_, i) => i !== idx))}
          />
        ))}
      </div>

      {!recordId && (
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={addLot}>
            <Plus className="size-3.5 mr-1" /> Add lot
          </Button>
        </div>
      )}
      {recordId && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Lots are locked after submission to keep Sample IDs stable. Edits to individual samples happen in Intake / Samples.
        </p>
      )}
    </div>
  );
}

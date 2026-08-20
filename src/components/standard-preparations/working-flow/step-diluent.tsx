import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionPicker } from "../solid-flow/solvent-picker";

interface Props {
  diluentName: string;
  diluentLot: string;
  onDiluentName: (v: string) => void;
  onDiluentLot: (v: string) => void;
}

export function StepDiluent({ diluentName, diluentLot, onDiluentName, onDiluentLot }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 2 — Diluent</h2>
        <p className="text-sm text-muted-foreground">
          A working standard is a straight dilution of the primary into one diluent — no percentage mixing.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Diluent <span className="text-destructive">*</span></Label>
            <div className="mt-1">
              <OptionPicker kind="solvent" value={diluentName} onChange={onDiluentName} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Lot # (optional)</Label>
            <Input className="mt-1" value={diluentLot} onChange={e => onDiluentLot(e.target.value)} />
          </div>
        </div>
      </Card>
    </div>
  );
}

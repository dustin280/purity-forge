import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2 } from "lucide-react";
import { StandardPicker, type PickedStandard } from "../standard-picker";
import type { WorkingSource } from "./types";

interface Props {
  source: WorkingSource | null;
  onChange: (s: WorkingSource | null) => void;
}

export function StepSource({ source, onChange }: Props) {
  function pick(s: PickedStandard) {
    onChange(s);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Source</h2>
        <p className="text-sm text-muted-foreground">
          Select the approved, unexpired primary standard this working standard is diluted from.
        </p>
      </div>

      {source ? (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold">{source.standard_name}</div>
                <div className="text-xs text-muted-foreground">
                  {source.syn_id || "—"} · {source.final_concentration_value} {source.final_concentration_unit} · {source.volume_remaining_ml ?? source.final_volume_ml} mL available
                </div>
                <div className="text-xs text-muted-foreground">
                  {source.expiration_date ? `Expires ${source.expiration_date}` : "No expiration recorded"}
                  {source.ref_material_name ? ` · Traces to ${source.ref_material_name}` : ""}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
              <X className="size-4" />
            </Button>
          </div>
        </Card>
      ) : (
        <StandardPicker onPick={pick} />
      )}
    </div>
  );
}

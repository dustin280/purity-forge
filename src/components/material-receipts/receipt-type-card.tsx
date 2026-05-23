import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MATERIAL_TYPES, type MaterialType } from "@/lib/material-receipts.functions";

export function MaterialTypeCard({ value, onChange }: { value: MaterialType; onChange: (t: MaterialType) => void }) {
  const isControlled = value === "controlled";
  return (
    <Card className="p-5 border-primary/30">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Material Type</Label>
      <div className="mt-2 grid grid-cols-2 gap-2 max-w-md">
        {MATERIAL_TYPES.map(t => (
          <button
            type="button"
            key={t}
            onClick={() => onChange(t)}
            className={`px-4 py-3 rounded-md border text-sm font-medium capitalize transition-colors ${
              value === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {isControlled
          ? "Controlled materials require manufacturer details, COA/SDS, QC review and approval."
          : "Uncontrolled materials use a simplified intake form."}
      </p>
    </Card>
  );
}
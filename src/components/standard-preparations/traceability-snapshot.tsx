import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoRow } from "./info-row";
import type { StandardPrepRow } from "@/lib/standard-preparations.functions";

/** Read-only snapshot of traceability fields captured from the linked material receipt. */
export function TraceabilitySnapshot({ row: r }: { row: StandardPrepRow }) {
  const hasAny =
    r.ref_material_name || r.ref_lot || r.ref_purity_percent != null || r.ref_concentration_mg_per_ml != null ||
    r.ref_molecular_weight != null || r.ref_receipt_date ||
    r.initial_solvent || r.final_diluent || r.modifier_percent != null ||
    r.expiration_period_code;
  if (!hasAny) return null;
  const isLiquid = r.ref_form === "liquid";
  return (
    <Card className="p-5 mb-6 text-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Traceability Snapshot
        </h2>
        {r.material_overridden && <Badge variant="outline">Overridden</Badge>}
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
        <InfoRow label="Ref material" value={r.ref_material_name} />
        <InfoRow label="Ref lot" value={r.ref_lot} />
        {isLiquid
          ? <InfoRow label="Stock conc" value={r.ref_concentration_mg_per_ml != null ? `${r.ref_concentration_mg_per_ml} mg/mL` : null} />
          : <InfoRow label="Ref purity" value={r.ref_purity_percent != null ? `${r.ref_purity_percent}%` : null} />}
        <InfoRow label="Ref MW" value={r.ref_molecular_weight != null ? `${r.ref_molecular_weight} g/mol` : null} />
        <InfoRow label="Receipt date" value={r.ref_receipt_date} />
        <InfoRow label="Expiration period" value={r.expiration_period_code ?? (r.expiration_period_days ? `${r.expiration_period_days} d` : null)} />
        <InfoRow label="Initial solvent" value={r.initial_solvent} />
        <InfoRow label="Final diluent" value={r.final_diluent} />
        <InfoRow label="Modifier %" value={r.modifier_percent != null ? `${r.modifier_percent}%` : null} />
      </div>
    </Card>
  );
}
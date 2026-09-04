import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StandardSetLevel } from "@/lib/standard-preparations/standard-set.functions";

/**
 * Desired standards for a standard set: every level down the side, every
 * compound across the top, the final concentration of each compound at each
 * level in the cells (with the stock aliquot that produced it underneath),
 * and the diluent volume per level. The per-level target rows only carry the
 * first compound's concentration, which is why the old table read as a
 * single unnamed standard (Dustin, 2026-09-04).
 */
export function StandardSetLevelsTable({
  levels,
  diluentName,
  batchVolumeMl,
}: {
  levels: StandardSetLevel[];
  diluentName: string | null;
  batchVolumeMl: number | null;
}) {
  if (levels.length === 0) return null;
  const compounds: string[] = [];
  const stockOf = new Map<string, number>();
  for (const l of levels)
    for (const c of l.components) {
      if (!compounds.includes(c.compound_name)) compounds.push(c.compound_name);
      if (c.stock_concentration_mg_per_ml != null && !stockOf.has(c.compound_name))
        stockOf.set(c.compound_name, c.stock_concentration_mg_per_ml);
    }

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Desired Standards ({levels.length} level{levels.length === 1 ? "" : "s"} ·{" "}
          {compounds.length} compound{compounds.length === 1 ? "" : "s"})
        </h2>
        <div className="text-xs text-muted-foreground">
          Final concentration per compound, mg/mL
          {batchVolumeMl != null ? ` · ${batchVolumeMl} mL per level` : ""}
          {diluentName ? ` · diluent ${diluentName}` : ""}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Level</TableHead>
              {compounds.map((name) => (
                <TableHead key={name} className="text-right whitespace-nowrap">
                  {name}
                  {stockOf.has(name) && (
                    <div className="text-[10px] font-normal text-muted-foreground">
                      stock {stockOf.get(name)} mg/mL
                    </div>
                  )}
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">Diluent (µL)</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.map((l) => {
              const byName = new Map(l.components.map((c) => [c.compound_name, c] as const));
              return (
                <TableRow key={l.target_id}>
                  <TableCell className="font-medium">{l.label}</TableCell>
                  {compounds.map((name) => {
                    const c = byName.get(name);
                    return (
                      <TableCell key={name} className="text-right tabular-nums align-top">
                        {c?.concentration_mg_per_ml != null ? (
                          <>
                            <div>{c.concentration_mg_per_ml}</div>
                            {c.stock_volume_ul != null && (
                              <div className="text-[11px] text-muted-foreground">
                                {c.stock_volume_ul} µL
                                {c.source_label ? ` of ${c.source_label}` : ""}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right tabular-nums align-top">
                    {l.diluent_volume_ul ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground align-top">
                    {l.expected_note || ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/**
 * Read-only summary of CoC line items rendered inside the view dialog. Shows
 * one card per sample with key metadata derived from the stored line_items
 * column on the chain_of_custody_records row.
 */
import { Badge } from "@/components/ui/badge";
import type { CocLineItemView } from "./types";

export function CocLineItemsView({ items }: { items: CocLineItemView[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="text-sm font-semibold mb-2">Samples ({items.length})</div>
      <div className="space-y-3">
        {items.map((li, idx) => {
          const rows: Array<[string, string]> = [
            ["Lot / Batch", li.lot || "—"],
            ["Catalog #", li.catalog || "—"],
            ["Manufacturer", li.manufacturer || "—"],
            ["Manufacture Date", li.manufacture_date || "—"],
            ["Client Received Date", li.client_received_date || "—"],
            ["Container Size", li.container_size || "—"],
            ["Concentration", li.concentration || "—"],
            ["Quantity / vial", li.quantity ? `${li.quantity}${li.quantity_unit ? ` ${li.quantity_unit}` : ""}` : "—"],
            ["Temperature (°C)", li.temperature_c == null || li.temperature_c === "" ? "—" : String(li.temperature_c)],
            ["Storage", li.storage || "—"],
            ["Requested Tests", (li.requested_tests ?? []).join(", ") || "—"],
            ["Physical Description", li.physical_description || "—"],
          ];
          return (
            <div key={idx} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  Sample {String(idx + 1).padStart(2, "0")}
                </Badge>
                <div className="text-sm font-medium">{li.compound || "—"}</div>
                {li.vial_count && li.vial_count > 1 && (
                  <Badge variant="secondary" className="text-[10px]">×{li.vial_count} vials</Badge>
                )}
              </div>
              <dl className="grid sm:grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-xs">
                {rows.map(([k, v]) => (
                  <div key={k} className="sm:contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
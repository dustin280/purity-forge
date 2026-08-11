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
          const labelContent = li.label_content_value
            ? `${li.label_content_value}${li.label_content_unit ? ` ${li.label_content_unit}` : ""}`
            : "—";
          const formRows: Array<[string, string]> = (() => {
            switch (li.physical_form) {
              case "liquid":
                return [
                  ["Bottle Size", li.bottle_size || "—"],
                  ["Volume in Bottle", li.liquid_volume_ml ? `${li.liquid_volume_ml} mL` : "—"],
                  ["Label Content", li.label_content_basis === "per_bottle" ? `${labelContent} / bottle` : `${labelContent} / mL`],
                ];
              case "capsule":
                return [
                  ["Label Content", `${labelContent} / capsule`],
                  ["# of Capsules", li.capsule_count || "—"],
                ];
              case "solid":
                return [
                  ["Container Size", li.container_size || "—"],
                  ["Label Content", labelContent],
                ];
              default:
                return [];
            }
          })();
          const rows: Array<[string, string]> = [
            ["Physical Form", li.physical_form ? li.physical_form[0].toUpperCase() + li.physical_form.slice(1) : "—"],
            ["Lot / Batch", li.lot || "—"],
            ["Catalog #", li.catalog || "—"],
            ["Manufacturer", li.manufacturer || "—"],
            ["Manufacture Date", li.manufacture_date || "—"],
            ["Client Received Date", li.client_received_date || "—"],
            ...formRows,
            ["Requested Tests", (li.requested_tests ?? []).join(", ") || "—"],
            ["Physical Description", li.physical_description || "—"],
          ];
          const otherComponents = li.is_multi_component ? (li.components ?? []) : [];
          return (
            <div key={idx} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className="font-mono text-[10px]">
                  Sample {String(idx + 1).padStart(2, "0")}
                </Badge>
                <div className="text-sm font-medium">{li.compound || "—"}</div>
                {li.vial_count && li.vial_count > 1 && (
                  <Badge variant="secondary" className="text-[10px]">×{li.vial_count} vials</Badge>
                )}
                {li.is_multi_component && <Badge variant="secondary" className="text-[10px]">Multi-component</Badge>}
              </div>
              {otherComponents.length > 0 && (
                <div className="text-xs text-muted-foreground mb-2">
                  + {otherComponents.map((c) => `${c.compound}${c.label_content_value ? ` (${c.label_content_value}${c.label_content_unit ? ` ${c.label_content_unit}` : ""})` : ""}`).join(", ")}
                </div>
              )}
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
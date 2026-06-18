/**
 * Client-side part number lookup against the bundled HPLC column and
 * Agilent parts CSVs. Used by the Add Inventory form to auto-fill fields.
 */
import { loadVendorColumns, VENDORS, type ColumnRow } from "@/lib/maintenance/columns";
import { loadParts, type PartRow } from "@/lib/maintenance/parts";

export type LookupFields = {
  make: string;
  model: string;
  description: string;
};

export type LookupResult =
  | { source: "column"; values: LookupFields; label: string; row: ColumnRow }
  | { source: "part"; values: LookupFields; label: string; row: PartRow }
  | { source: "none" };

function normalize(s: string): string {
  return s.toUpperCase().replace(/[\s\-_/]/g, "");
}

function columnDescription(c: ColumnRow): string {
  const parts = [
    c.specs,
    c.particleSize && `${c.particleSize} particle`,
    c.innerDiameter && `${c.innerDiameter} ID`,
    c.length && `${c.length} length`,
    c.poreSize && `${c.poreSize} pore`,
    c.hardware,
    c.application,
  ].filter(Boolean);
  return parts.join(" · ") || c.description || "";
}

function partDescription(p: PartRow): string {
  const ctx = [p.module, p.subsystem].filter(Boolean).join(" / ");
  return [p.description, ctx].filter(Boolean).join(" — ");
}

export function lookupPartNumber(pn: string): LookupResult {
  const needle = normalize(pn);
  if (!needle) return { source: "none" };

  // 1) HPLC columns: exact then substring across all vendors.
  for (const v of VENDORS) {
    const rows = loadVendorColumns(v.id);
    const exact = rows.find(r => r.partNumber && normalize(r.partNumber) === needle);
    if (exact) {
      return {
        source: "column",
        label: `${v.label} HPLC column`,
        row: exact,
        values: {
          make: v.label,
          model: exact.name || exact.productFamily || exact.partNumber,
          description: columnDescription(exact),
        },
      };
    }
  }
  for (const v of VENDORS) {
    const rows = loadVendorColumns(v.id);
    const sub = rows.find(r => r.partNumber && normalize(r.partNumber).includes(needle));
    if (sub) {
      return {
        source: "column",
        label: `${v.label} HPLC column`,
        row: sub,
        values: {
          make: v.label,
          model: sub.name || sub.productFamily || sub.partNumber,
          description: columnDescription(sub),
        },
      };
    }
  }

  // 2) Agilent instrument parts: exact then substring (also check `replaces`).
  const parts = loadParts();
  const exactPart = parts.find(p =>
    (p.partNumber && normalize(p.partNumber) === needle) ||
    (p.replaces && normalize(p.replaces).split(",").includes(needle))
  );
  if (exactPart) {
    return {
      source: "part",
      label: "Agilent instrument part",
      row: exactPart,
      values: {
        make: "Agilent",
        model: exactPart.partNumber,
        description: partDescription(exactPart),
      },
    };
  }
  const subPart = parts.find(p =>
    (p.partNumber && normalize(p.partNumber).includes(needle)) ||
    (p.replaces && normalize(p.replaces).includes(needle))
  );
  if (subPart) {
    return {
      source: "part",
      label: "Agilent instrument part",
      row: subPart,
      values: {
        make: "Agilent",
        model: subPart.partNumber,
        description: partDescription(subPart),
      },
    };
  }

  return { source: "none" };
}
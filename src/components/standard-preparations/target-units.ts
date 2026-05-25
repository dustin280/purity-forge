/**
 * Registry of supported concentration units for desired-standard rows.
 * Storage stays normalized in mg/mL — every UI input is converted via
 * `toMgPerMl` before persisting, and re-displayed with `fromMgPerMl`.
 *
 * To add a new unit, append one entry to `CONC_UNITS`. Nothing else needs
 * to change.
 */
export type ConcUnit = "mg/mL" | "mg/L";

export const CONC_UNITS: Array<{ value: ConcUnit; label: string; toMgPerMl: number }> = [
  { value: "mg/mL", label: "mg/mL", toMgPerMl: 1 },
  { value: "mg/L",  label: "mg/L",  toMgPerMl: 0.001 },
];

export const DEFAULT_CONC_UNIT: ConcUnit = "mg/mL";

export function isConcUnit(x: unknown): x is ConcUnit {
  return typeof x === "string" && CONC_UNITS.some(u => u.value === x);
}

function factorFor(unit: ConcUnit): number {
  return CONC_UNITS.find(u => u.value === unit)?.toMgPerMl ?? 1;
}

/** Convert a value entered in `unit` into mg/mL. */
export function toMgPerMl(value: number, unit: ConcUnit): number {
  return value * factorFor(unit);
}

/** Convert a stored mg/mL value back into `unit`. */
export function fromMgPerMl(mgPerMl: number, unit: ConcUnit): number {
  const f = factorFor(unit);
  return f === 0 ? mgPerMl : mgPerMl / f;
}

/** Pretty display, e.g. `5 mg/L`. */
export function formatConcDisplay(mgPerMl: number | null | undefined, unit: ConcUnit | null | undefined): string | null {
  if (mgPerMl == null) return null;
  const u: ConcUnit = isConcUnit(unit) ? unit : DEFAULT_CONC_UNIT;
  const v = fromMgPerMl(mgPerMl, u);
  // Trim trailing zeros but keep precision
  const s = Number.isInteger(v) ? String(v) : Number(v.toPrecision(6)).toString();
  return `${s} ${u}`;
}
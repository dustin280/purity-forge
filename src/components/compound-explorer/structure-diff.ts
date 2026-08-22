/**
 * Diff a non-conformance (impurity) structure against its native parent so the
 * viewer can show *what changed*, not just the end state.
 *
 * The impurity generators deliberately preserve native atom ids wherever the
 * atom survives the transform — a deamidation, for example, reuses the removed
 * amide nitrogen's id for the oxygen that replaces it. That makes a plain
 * id-keyed comparison meaningful: same id + different element is a genuine
 * in-place substitution rather than a renumbering artefact.
 */
import type { StructureAtom, StructureBond } from "@/lib/nc-structures.functions";

export type StructureDiff = {
  /** Present in the impurity, absent from the native (e.g. an added oxidation O). */
  addedAtoms: number[];
  /** Present in the native, absent from the impurity (e.g. a cleaved lipid chain). */
  removedAtoms: number[];
  /** Same atom id, different element — an in-place substitution. */
  substitutedAtoms: { id: number; from: string; to: string }[];
  addedBonds: number;
  removedBonds: number;
  /** Bond retained but its order changed (e.g. a disulfide reduced to thiols). */
  reorderedBonds: number;
  /**
   * Atoms to light up in the impurity view: everything added or substituted,
   * plus the endpoints of any bond that was added or had its order changed.
   * Removed atoms cannot be shown here — they do not exist in this structure.
   */
  highlight: Set<number>;
};

const bondKey = (b: StructureBond) => (b.a < b.b ? `${b.a}:${b.b}` : `${b.b}:${b.a}`);

export function diffStructures(
  native: { atoms: StructureAtom[]; bonds: StructureBond[] } | null | undefined,
  variant: { atoms: StructureAtom[]; bonds: StructureBond[] } | null | undefined,
): StructureDiff | null {
  if (!native || !variant) return null;

  const nativeAtoms = new Map(native.atoms.map(a => [a.id, a]));
  const variantAtoms = new Map(variant.atoms.map(a => [a.id, a]));

  const addedAtoms: number[] = [];
  const substitutedAtoms: StructureDiff["substitutedAtoms"] = [];
  for (const [id, a] of variantAtoms) {
    const n = nativeAtoms.get(id);
    if (!n) addedAtoms.push(id);
    else if (n.element !== a.element) substitutedAtoms.push({ id, from: n.element, to: a.element });
  }

  const removedAtoms: number[] = [];
  for (const id of nativeAtoms.keys()) if (!variantAtoms.has(id)) removedAtoms.push(id);

  const nativeBonds = new Map(native.bonds.map(b => [bondKey(b), b.order]));
  const variantBonds = new Map(variant.bonds.map(b => [bondKey(b), b.order]));

  const highlight = new Set<number>([...addedAtoms, ...substitutedAtoms.map(s => s.id)]);

  let addedBonds = 0;
  let reorderedBonds = 0;
  for (const [key, order] of variantBonds) {
    const prev = nativeBonds.get(key);
    if (prev === undefined) addedBonds++;
    else if (prev !== order) reorderedBonds++;
    else continue;
    // Light up both ends of any bond the transform created or re-ordered.
    for (const part of key.split(":")) highlight.add(Number(part));
  }

  let removedBonds = 0;
  for (const key of nativeBonds.keys()) {
    if (variantBonds.has(key)) continue;
    removedBonds++;
    // For a pure removal (a cleaved lipid, a reduced disulfide) nothing is
    // added or substituted, so without this the viewer would highlight
    // nothing at all. Light up whichever endpoint survived — that is the
    // attachment/cleavage site the analyst actually wants to see.
    for (const part of key.split(":")) {
      const id = Number(part);
      if (variantAtoms.has(id)) highlight.add(id);
    }
  }

  return {
    addedAtoms,
    removedAtoms,
    substitutedAtoms,
    addedBonds,
    removedBonds,
    reorderedBonds,
    highlight,
  };
}

/** Human-readable one-liners describing the transform, for the summary panel. */
export function describeDiff(d: StructureDiff, elementOf: (id: number) => string | undefined): string[] {
  const out: string[] = [];
  if (d.addedAtoms.length) {
    const counts = new Map<string, number>();
    for (const id of d.addedAtoms) {
      const el = elementOf(id) ?? "?";
      counts.set(el, (counts.get(el) ?? 0) + 1);
    }
    const parts = [...counts.entries()].map(([el, n]) => (n > 1 ? `${n}×${el}` : el));
    out.push(`${d.addedAtoms.length} atom${d.addedAtoms.length > 1 ? "s" : ""} added (${parts.join(", ")})`);
  }
  if (d.removedAtoms.length) {
    out.push(`${d.removedAtoms.length} atom${d.removedAtoms.length > 1 ? "s" : ""} removed`);
  }
  for (const s of d.substitutedAtoms) out.push(`${s.from} → ${s.to} substitution at atom ${s.id}`);
  if (d.addedBonds) out.push(`${d.addedBonds} bond${d.addedBonds > 1 ? "s" : ""} formed`);
  if (d.removedBonds) out.push(`${d.removedBonds} bond${d.removedBonds > 1 ? "s" : ""} broken`);
  if (d.reorderedBonds) out.push(`${d.reorderedBonds} bond order change${d.reorderedBonds > 1 ? "s" : ""}`);
  if (!out.length) out.push("Same connectivity and composition — an isomer or stereochemical change.");
  return out;
}

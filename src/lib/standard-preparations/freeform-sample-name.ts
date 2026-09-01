/**
 * Sample-name convention for Standard Prep Freelance's run list and label
 * sheet. Both consume the exact same string on purpose: the label on the
 * vial and the Sample Name in the OpenLab sequence have to read identically
 * or the technician can't match a vial back to its injection row.
 *
 * Dustin, 2026-09-01: "[Level(L1, L2...] [name] [(Compound1 first initial)
 * +Concentration (Compound2 first initial)+Concentration of compound...]
 * <d>"
 *
 * The trailing marker is written <D> (uppercase), matching the literal
 * token OpenLab already looks for elsewhere in this app (run-lists/
 * generate.functions.ts, run-lists.functions.ts) to append a result
 * timestamp -- not a typo to preserve, the same real convention reused.
 */

export function firstInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** 3 decimal places, trailing zeros trimmed -- matches the 0.005 mg/mL grid. */
function trimConc(n: number): string {
  return Number(n.toFixed(3)).toString();
}

export interface FreelanceNamingComponent {
  name: string;
  concMgPerMl: number;
}
export interface FreelanceNamingLevel {
  label: string;
  components: FreelanceNamingComponent[];
}

/** "L1 <standard name> B0.28 G0.14 <D>" */
export function freelanceSampleName(standardName: string, level: FreelanceNamingLevel): string {
  const mid = level.components.map(c => `${firstInitial(c.name)}${trimConc(c.concMgPerMl)}`).join(" ");
  return [level.label, standardName.trim(), mid, "<D>"].filter(p => p.length > 0).join(" ");
}

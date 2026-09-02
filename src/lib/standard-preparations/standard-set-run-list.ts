/**
 * Run list CSV for an already-submitted Standard Set / Standard Prep
 * Freelance record -- same column set as freeform-run-list.ts (matches the
 * real OpenLab sequence import used everywhere else in this app), but built
 * from a PERSISTED record (StandardSetDetail) instead of live in-memory
 * levels, so it's reusable any time after submission -- these standards get
 * re-injected on later runs, not just printed once at creation.
 *
 * Deliberately does NOT reuse freeform-sample-name.ts's firstInitial(): that
 * rule takes a compound's first letter, which breaks on a name that starts
 * with a digit -- "5 Amino 1MQ" becomes "5", and "5" immediately followed by
 * a concentration ("50.05") reads as one number, not an abbreviation plus a
 * value. Every real component here already carries its OWN abbreviation in
 * source_label ("NAD primary", "5AM 1:10"...) -- the one the analyst actually
 * typed at creation -- so this uses that instead of re-deriving one.
 */
import type { StandardSetDetail } from "./standard-set.functions";

const RUN_LIST_HEADERS = [
  "Sample name", "Sample type", "Vial", "Volume",
  "Acq Method", "Proc Method", "Data file", "Description", "Level",
  "Sample Amt", "Dil. Factor 1", "LimsId1",
  "Client", "Appearance", "NetFContent", "Accession Number",
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 3 decimal places, trailing zeros trimmed -- matches the 0.005 mg/mL grid. */
function trimConc(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** The abbreviation this component was actually made under -- the first
 * word of source_label ("NAD primary" -> "NAD", "5AM 1:10" -> "5AM"). Falls
 * back to the compound name itself on the rare row with no source_label.
 * Exported for reuse anywhere else a persisted record's components need
 * their real abbreviation back (e.g. re-exporting the cut sheet PDF) --
 * compound_name.slice(0,3) has the same digit-collision problem this
 * module exists to avoid, just quieter ("5 Amino 1MQ" -> "5 A"). */
export function abbrevFor(compoundName: string, sourceLabel: string | null): string {
  const word = sourceLabel?.trim().split(/\s+/)[0];
  return word || compoundName.slice(0, 3).toUpperCase();
}

export function standardSetRunListCsv(detail: StandardSetDetail): string {
  const rows = detail.levels.map(level => {
    const mid = level.components
      .filter(c => c.concentration_mg_per_ml != null)
      .map(c => `${abbrevFor(c.compound_name, c.source_label)}${trimConc(c.concentration_mg_per_ml!)}`)
      .join(" ");
    const name = [level.label, detail.standard_name.trim(), mid, "<D>"].filter(p => p.length > 0).join(" ");
    return [
      name, "Cal. Std.", "", "",
      "", "", "", detail.standard_name.trim(), level.label,
      "", "", "",
      "", "", "", "",
    ].map(csvEscape).join(",");
  });
  // BOM so Excel opens it as UTF-8 rather than guessing -- same convention
  // as the real run-list export (generate.functions.ts' csvWithBom).
  return "﻿" + [RUN_LIST_HEADERS.join(","), ...rows].join("\r\n");
}

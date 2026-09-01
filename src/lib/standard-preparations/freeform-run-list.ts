/**
 * Run list CSV for Standard Prep Freelance -- matches the real OpenLab
 * sequence column set used everywhere else in this app
 * (run-lists/generate.functions.ts' sequenceToCsv), so it imports the same
 * way an analyst already expects. Columns Freelance has no basis for
 * (Acq/Proc Method, Client, NetFContent, Accession Number...) are left
 * blank rather than guessed -- this tool has no method assignment, no
 * client, no received-quantity data to draw them from.
 */
import { freelanceSampleName, type FreelanceNamingLevel } from "./freeform-sample-name";

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

/** "Cal. Std." is the same Sample Type string OpenLab expects for a real
 * calibration level row (mapSampleType in generate.functions.ts) -- these
 * levels ARE that, just built without the library's calibration lookups. */
export function freelanceRunListCsv(standardName: string, levels: FreelanceNamingLevel[]): string {
  const rows = levels.map(l => {
    const name = freelanceSampleName(standardName, l);
    return [
      name, "Cal. Std.", "", "",
      "", "", "", standardName.trim(), l.label,
      "", "", "",
      "", "", "", "",
    ].map(csvEscape).join(",");
  });
  // BOM so Excel opens it as UTF-8 rather than guessing -- same convention
  // as the real run-list export (generate.functions.ts' csvWithBom).
  return "﻿" + [RUN_LIST_HEADERS.join(","), ...rows].join("\r\n");
}

/**
 * Recommended multi-compound calibration standards.
 *
 * Every compound with a calibration on the main gradient is packed into as
 * few standards as possible, subject to one rule: **no two compounds in the
 * same standard may elute within 0.40 min of each other.** That floor is what
 * keeps two peaks in one injection independently integrable; below it the
 * valley between them stops being a reliable place to drop a baseline.
 *
 * The retention times below were measured by Dustin on a single method
 * (2026-08-30). He noted they may not match the current method exactly, but
 * they were all collected together, so the *relative* spacing -- the only
 * thing this grouping depends on -- holds.
 *
 * Why five general standards and not fewer: five compounds (Melanotan MT-II,
 * Sermorelin, Kisspeptin-10, Tesamorelin, CJC-1295) all fall inside a single
 * 0.40 min window from 9.425 to 9.676, with Sermorelin/Kisspeptin-10 0.057
 * apart and Tesamorelin/CJC-1295 0.009 apart. No packing can do better than
 * one standard per member of the worst cluster, so five is the floor, not a
 * conservative choice.
 *
 * The lipidated GLP-1s are split into their own standard rather than packed
 * by retention time alone. They are the three latest-eluting compounds in the
 * library and need an organic co-solvent to stay in solution at standard
 * concentrations; isolating them lets the other four standards be made up in
 * plain aqueous mobile phase. Tirzepatide is the exception -- it co-elutes
 * too close to Retatrutide (0.207 min) to share their standard, so it rides
 * in Standard 1, which therefore needs the same co-solvent treatment.
 */
export interface MultiStdMember {
  /** Canonical `compounds.name`. Resolution also tries the alias list. */
  name: string;
  /** Retention time, minutes, on the method the set was measured with. */
  rtMin: number;
  /** Column header on the grid and cut sheet. Kept unique within a standard. */
  abbrev: string;
}

export interface MultiCompoundStandard {
  id: string;
  name: string;
  members: MultiStdMember[];
  /** Why this grouping exists, when it isn't simply "these fit". */
  note?: string;
  /** Something the analyst has to know before making it up. */
  caution?: string;
}

/** Minimum retention gap between any two compounds sharing a standard. */
export const MIN_RT_GAP_MIN = 0.4;

/**
 * The full-length peptide and its fragment are separate library rows, and
 * which calibration range belongs to which was never resolved -- the probe
 * into the two cal folders was inconclusive. They are far apart here (4.427
 * vs 9.165), so if the rows are swapped these two standards are wrong in a
 * way that packing cannot detect: 9.165 would sit 0.29 min from Sermorelin
 * in Standard 1, inside the gap floor.
 */
const TB_CAUTION =
  "Confirm this is the right Thymosin — the full-length peptide and the TB500 fragment are separate library rows and their calibration ranges may be swapped.";

const ORGANIC_NOTE =
  "Lipidated — needs an organic co-solvent to stay in solution; don't make this one up in plain aqueous mobile phase.";

export const MULTI_COMPOUND_STANDARDS: MultiCompoundStandard[] = [
  {
    id: "glp",
    name: "GLP standard",
    note: ORGANIC_NOTE,
    members: [
      { name: "Cagrilintide", rtMin: 11.093, abbrev: "CAG" },
      { name: "Semaglutide", rtMin: 11.897, abbrev: "SEMA" },
      { name: "Retatrutide", rtMin: 12.928, abbrev: "RETA" },
    ],
  },
  {
    id: "std-1",
    name: "Standard 1",
    note: `Holds Tirzepatide, which cannot share the GLP standard (0.207 min from Retatrutide). ${ORGANIC_NOTE}`,
    caution: TB_CAUTION,
    members: [
      { name: "Thymosin Beta 4 (full-length 43-aa)", rtMin: 4.427, abbrev: "TB4" },
      { name: "Semax", rtMin: 6.381, abbrev: "SMX" },
      { name: "PT-141 (Bremelanotide)", rtMin: 8.41, abbrev: "PT141" },
      { name: "Sermorelin", rtMin: 9.459, abbrev: "SER" },
      { name: "Tirzepatide", rtMin: 13.135, abbrev: "TIRZ" },
    ],
  },
  {
    id: "std-2",
    name: "Standard 2",
    members: [
      { name: "Cortagen", rtMin: 5.223, abbrev: "CTG" },
      { name: "Ipamorelin", rtMin: 6.867, abbrev: "IPA" },
      { name: "GHRP-6", rtMin: 8.729, abbrev: "GH6" },
      { name: "Kisspeptin-10", rtMin: 9.516, abbrev: "KISS" },
    ],
  },
  {
    id: "std-3",
    name: "Standard 3",
    members: [
      { name: "SS-31 (Elamipritide)", rtMin: 5.92, abbrev: "SS31" },
      { name: "BPC-157 Arginate", rtMin: 7.389, abbrev: "BPC-R" },
      { name: "Hexarelin", rtMin: 8.91, abbrev: "HEX" },
      { name: "Tesamorelin", rtMin: 9.667, abbrev: "TESA" },
    ],
  },
  {
    id: "std-4",
    name: "Standard 4",
    caution: TB_CAUTION,
    members: [
      { name: "BPC-157 Acetate", rtMin: 6.213, abbrev: "BPC-A" },
      { name: "MOTS-C", rtMin: 8.149, abbrev: "MOTS" },
      { name: "TB500 (Thymosin β4 fragment)", rtMin: 9.165, abbrev: "TB5" },
      { name: "CJC-1295", rtMin: 9.676, abbrev: "CJC" },
    ],
  },
  {
    id: "std-5",
    name: "Standard 5",
    members: [
      { name: "DSIP", rtMin: 6.289, abbrev: "DSIP" },
      { name: "Melanotan (MT-I)", rtMin: 8.25, abbrev: "MT1" },
      { name: "Melanotan (MT-II)", rtMin: 9.425, abbrev: "MT2" },
      { name: "GHRP-2", rtMin: 9.919, abbrev: "GH2" },
    ],
  },
];

/**
 * The twelve compounds that elute before 2 min are deliberately absent.
 * On this method they are stacked in the void volume -- seven of them inside
 * one 0.40 min window, four pairs under 0.10 min apart -- so grouping them by
 * these retention times would produce standards whose peaks cannot be told
 * apart. They need retention times from the aqueous method before they can be
 * packed, and that data doesn't exist yet.
 */
export const POLAR_UNGROUPED = [
  "Vilon", "Thymalin", "Cartalax", "GHK-Cu", "Pinealon", "Epitalon",
  "NAD (NAD+)", "SLU-PP-332", "Glutathione", "KPV", "Selank", "5 Amino 1MQ",
];

/**
 * Calibrated, on the main gradient, and still left out: Dustin's call on
 * 2026-08-30 -- "Tadalafil is still under development and will be run alone."
 * Not a packing result, so it isn't something to re-derive.
 */
export const RUN_ALONE = ["Tadalafil"];

/** Retention span of a standard, and its tightest internal gap. */
export function standardSpread(std: MultiCompoundStandard): {
  firstRt: number; lastRt: number; closestGapMin: number;
} {
  const rts = std.members.map(m => m.rtMin).sort((a, b) => a - b);
  let closest = Infinity;
  for (let i = 1; i < rts.length; i++) closest = Math.min(closest, rts[i] - rts[i - 1]);
  return { firstRt: rts[0], lastRt: rts[rts.length - 1], closestGapMin: closest };
}

/**
 * Matches a recommended member to a row in the compound library. Exact name
 * first, then the alias list -- the recommendations carry canonical names, so
 * the alias path is only there to survive a rename.
 */
export function resolveMember<T extends { id: string; name: string; aliases?: string[] | null }>(
  member: MultiStdMember, library: T[],
): T | null {
  const want = member.name.trim().toLowerCase();
  const exact = library.find(c => c.name.trim().toLowerCase() === want);
  if (exact) return exact;
  const byAlias = library.filter(c => (c.aliases ?? []).some(a => a.trim().toLowerCase() === want));
  return byAlias.length === 1 ? byAlias[0] : null;
}

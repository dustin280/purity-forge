/**
 * Vial location parsing/formatting/enumeration for the Agilent autosampler
 * layout: up to 4 drawers (D1-D4), each with a Front and Back tray (F/B),
 * each tray a 6-column (A-F) x 9-row (1-9) grid — 54 positions per tray,
 * up to 432 total. D1 is reserved for QC samples (standards/blanks); D2+
 * are sample-eligible.
 *
 * Enumeration is row-major within a tray (A1, B1, C1, D1, E1, F1, A2, ...)
 * rather than column-major, because the lab runs 6-standard calibrations —
 * one row (a fixed number across all 6 letter columns) is one complete
 * standard set, which is how samples actually load out of the scheduler
 * and how a human finds things on the physical tray.
 */

export interface VialLocation {
  drawer: 1 | 2 | 3 | 4;
  tray: "F" | "B";
  column: string; // "A".."F"
  row: number; // 1..9
}

const LOCATION_RE = /^D([1-4])([FB])-([A-F])([1-9])$/;

export function parseVialLocation(location: string): VialLocation {
  // Case-insensitive input (a tech might type "d1f-a1"), canonical
  // uppercase output via formatVialLocation.
  const m = LOCATION_RE.exec(location.trim().toUpperCase());
  if (!m) {
    throw new Error(
      `Invalid vial location "${location}": expected format D[1-4][F/B]-[A-F][1-9], e.g. "D1F-A1"`,
    );
  }
  const [, drawer, tray, column, row] = m;
  return {
    drawer: Number(drawer) as VialLocation["drawer"],
    tray: tray as VialLocation["tray"],
    column,
    row: Number(row),
  };
}

/** Non-throwing variant for form/UI validation. */
export function tryParseVialLocation(location: string): VialLocation | null {
  try {
    return parseVialLocation(location);
  } catch {
    return null;
  }
}

export function formatVialLocation(loc: VialLocation): string {
  return `D${loc.drawer}${loc.tray}-${loc.column}${loc.row}`;
}

export const QC_DRAWER = 1;

/** D1 is reserved for QC samples (standards/blanks), not regular samples. */
export function isQcLocation(loc: VialLocation): boolean {
  return loc.drawer === QC_DRAWER;
}

export const MAX_DRAWERS = 4;
const TRAYS = ["F", "B"] as const;
const COLUMNS = ["A", "B", "C", "D", "E", "F"] as const;
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * All valid locations for an instrument configured with `drawerCount`
 * drawers (1-4, defaults to the max), in drawer -> tray -> row -> column
 * order. Every instrument has D1 first, so the QC drawer always exists as
 * long as drawerCount >= 1.
 */
export function enumerateAllVialLocations(drawerCount: number = MAX_DRAWERS): VialLocation[] {
  if (!Number.isInteger(drawerCount) || drawerCount < 1 || drawerCount > MAX_DRAWERS) {
    throw new Error(`drawerCount must be an integer 1-${MAX_DRAWERS}, got ${drawerCount}`);
  }
  const out: VialLocation[] = [];
  for (let drawer = 1; drawer <= drawerCount; drawer++) {
    for (const tray of TRAYS) {
      for (const row of ROWS) {
        for (const column of COLUMNS) {
          out.push({ drawer: drawer as VialLocation["drawer"], tray, column, row });
        }
      }
    }
  }
  return out;
}

/** D2+ only — the positions eligible for regular sample vials. */
export function enumerateSampleVialLocations(drawerCount: number = MAX_DRAWERS): VialLocation[] {
  return enumerateAllVialLocations(drawerCount).filter((l) => !isQcLocation(l));
}

/** D1 only (108 positions, present on any instrument with drawerCount >= 1) — reserved for QC standards/blanks. */
export function enumerateQcVialLocations(drawerCount: number = MAX_DRAWERS): VialLocation[] {
  return enumerateAllVialLocations(drawerCount).filter(isQcLocation);
}

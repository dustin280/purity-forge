/**
 * The bench grid: calibration levels that a fixed set of pipettors can make.
 *
 * Dustin, 2026-08-31: "I can also buy more pipettors for permanent settings.
 * If we could limit almost everything to like 12 volumes I can just build a
 * set, it would be very efficient... We can recalibrate standard
 * concentrations to normalize against ease of dilution factors."
 *
 * Held exactly where they were, the calibration levels cannot be served by
 * any practical pipettor set: 36 compounds x 6 levels are 216 near-arbitrary
 * points on the 0.005 mg/mL grid, and even sixteen fixed volumes reach only
 * 62% of them. The volumes are not the free variable -- the level values are.
 * Moved by a few percent, every level becomes makeable from twelve settings.
 *
 * A level is made by drawing PIPETTOR_VOLUMES_UL[i] from a stock that is
 * `factor` times weaker than the primary, into the batch volume. With the
 * palette factors composing 1:1/1:5/1:10, twelve volumes reach 182 distinct
 * concentrations spread across the whole working range.
 */
import { RATIO_PALETTE, ratioName } from "@/lib/sample-prep/dilution";

/**
 * Every volume the bench can deliver without touching a dial.
 *
 * The first three are the sample-prep ratios at a 1 mL working volume (1:1,
 * 1:5, 1:10) and are already in use. The remaining nine were solved for
 * directly against the live library, minimising the WORST level shift rather
 * than the average -- an average is no comfort to the one compound sitting at
 * the edge of it.
 *
 * Why twelve: ten leaves the worst level 6.7% off, eleven 5.1%, twelve 4.3%,
 * thirteen 4.2%. Dustin took the twelfth because it is worth a whole point;
 * the thirteenth is worth 0.15 and is where the curve stops paying. Note the
 * set is re-solved as a whole at each size rather than appended to, so the
 * twelve are not the eleven plus one.
 */
export const PIPETTOR_VOLUMES_UL = [
  100, 200, 500,                                        // sample prep: 1:10, 1:5, 1:1
  525, 550, 600, 645, 700, 770, 845, 920, 1000,         // calibration levels
] as const;

/**
 * Dilution factors reachable by composing the palette ratios. A level is made
 * from a stock this many times weaker than the primary, so a large aliquot of
 * a weak intermediate gives fine control at volumes that pipette accurately.
 */
function paletteFactors(maxSteps = 4): number[] {
  const out = new Set<number>([1]);
  const walk = (carried: number, depth: number) => {
    if (depth >= maxSteps) return;
    for (const r of RATIO_PALETTE) {
      const next = carried * r.factor;
      if (out.has(next)) continue;
      out.add(next);
      walk(next, depth + 1);
    }
  };
  walk(1, 0);
  return [...out].sort((a, b) => a - b);
}

export interface GridPoint {
  concMgPerMl: number;
  /** Aliquot to draw, µL. One of PIPETTOR_VOLUMES_UL. */
  volumeUl: number;
  /** How much weaker than the primary the source is. 1 = the primary itself. */
  factor: number;
  /** "primary" or "1:10", "1:100"... */
  sourceLabel: string;
}

/**
 * Every concentration the fixed pipettors can make at this batch volume.
 *
 * Both halves of the transfer have to clear the pipette floor, so an aliquot
 * leaving less than `floorUl` of diluent is rejected -- except a full-batch
 * draw, which is not a transfer at all but "use that stock neat".
 */
export function benchGrid(
  stockMgPerMl: number, batchUl: number, floorUl: number,
): GridPoint[] {
  if (!(stockMgPerMl > 0) || !(batchUl > 0)) return [];
  const byConc = new Map<number, GridPoint>();
  for (const volumeUl of PIPETTOR_VOLUMES_UL) {
    if (volumeUl < floorUl || volumeUl > batchUl) continue;
    const diluentUl = batchUl - volumeUl;
    if (diluentUl > 0 && diluentUl < floorUl) continue;
    for (const factor of paletteFactors()) {
      const concMgPerMl = (volumeUl / batchUl) * (stockMgPerMl / factor);
      if (!(concMgPerMl > 0)) continue;
      const key = Number(concMgPerMl.toPrecision(9));
      const existing = byConc.get(key);
      // Same concentration by two routes: prefer the one needing fewer
      // intermediates, then the larger aliquot.
      if (!existing || factor < existing.factor
        || (factor === existing.factor && volumeUl > existing.volumeUl)) {
        byConc.set(key, {
          concMgPerMl: key, volumeUl, factor,
          sourceLabel: factor === 1 ? "primary" : ratioName(factor),
        });
      }
    }
  }
  return [...byConc.values()].sort((a, b) => a.concMgPerMl - b.concMgPerMl);
}

export interface SnappedLevel {
  /** Where the level sits today. Null when the compound has none. */
  fromMgPerMl: number | null;
  point: GridPoint;
  /** Signed fractional move, e.g. -0.032 for 3.2% down. */
  shift: number;
}

/**
 * Moves a calibration ladder onto the bench grid.
 *
 * Two constraints beyond "nearest point", both of which matter:
 *
 * L1 is never lowered. Dustin's rule is that a range can usually go a little
 * higher and essentially never lower -- the bottom of the curve is where the
 * method was actually shown to work, so raising it is a choice and dropping
 * it is a claim about sensitivity nobody made.
 *
 * The ladder stays strictly increasing. Snapping each level independently can
 * collide two neighbours on a tight range (Thymosin B4 climbs in 0.05 steps),
 * which would silently produce a calibration curve with a duplicated point.
 * Each level is therefore chosen from the grid ABOVE the one before it.
 *
 * Returns null when no strictly increasing assignment exists -- possible in
 * principle for a very tight ladder near the top of the range, and worth
 * surfacing rather than quietly flattening.
 */
export function snapLadder(
  current: Array<number | null>, grid: GridPoint[],
): SnappedLevel[] | null {
  if (!grid.length) return null;
  const out: SnappedLevel[] = [];
  let floor = 0;
  let first = true;
  for (const conc of current) {
    if (conc == null || !(conc > 0)) continue;
    const pool = grid.filter(p =>
      p.concMgPerMl > floor + 1e-12 && (!first || p.concMgPerMl >= conc - 1e-12));
    if (!pool.length) return null;
    const best = pool.reduce((a, b) =>
      Math.abs(b.concMgPerMl - conc) / conc < Math.abs(a.concMgPerMl - conc) / conc ? b : a);
    out.push({ fromMgPerMl: conc, point: best, shift: (best.concMgPerMl - conc) / conc });
    floor = best.concMgPerMl;
    first = false;
  }
  return out.length ? out : null;
}

/** Largest absolute move in a snapped ladder, as a fraction. */
export function worstShift(snapped: SnappedLevel[]): number {
  return snapped.reduce((m, s) => Math.max(m, Math.abs(s.shift)), 0);
}

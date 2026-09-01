/**
 * Even concentration spreads for Standard Prep Freelance.
 *
 * Every other flow in this app builds a level ladder from a compound's
 * OWN calibration data (cal_l1..l6) or from a retention-time-driven preset.
 * Freelance is the deliberate exception: Dustin picks the compounds, types
 * a low and a high, and gets a spread back with no reference to what the
 * library says those compounds' ranges "should" be.
 *
 * The spacing rule isn't invented for this -- it's lifted from the shape
 * every real cal_l1..l6 row in the library already has. Checked directly
 * against the live data (2026-08-31): GHK-Cu 0.055/0.235/0.42/0.6/0.785/0.965
 * and Cortagen 0.105/0.285/0.465/0.64/0.82/1 both step by an identical
 * ~0.18 between every adjacent pair, L1 through L6 -- a plain arithmetic
 * progression from low to high, not front- or back-loaded. Freelance just
 * runs that same progression on numbers Dustin supplies instead of numbers
 * pulled from a compound row.
 */

/** The one rounding rule that applies everywhere in this app: 0.005 mg/mL. */
const CONC_GRID = 0.005;

export function roundToConcGrid(mgPerMl: number): number {
  return Math.round(mgPerMl / CONC_GRID) * CONC_GRID;
}

/**
 * `count` values evenly spaced from `lowMgPerMl` to `highMgPerMl` inclusive,
 * each snapped to the 0.005 mg/mL grid. `count` of 1 returns just the low
 * value -- there's no "spread" to compute over a single point.
 */
export function evenSpread(lowMgPerMl: number, highMgPerMl: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [roundToConcGrid(lowMgPerMl)];
  const step = (highMgPerMl - lowMgPerMl) / (n - 1);
  return Array.from({ length: n }, (_, i) => roundToConcGrid(lowMgPerMl + i * step));
}

/**
 * "Nice" concentration spreads for Standard Prep Freelance.
 *
 * Dustin, 2026-09-01, after being shown an evenly-spaced 0.23 mg/mL-step
 * result (0.1/0.33/0.56/0.79/1.02/1.25) and calling it "the opposite of
 * what we talked about": "Pipettors do well in ranges. 0.1 0.2 0.3 0.4 0.5
 * 0.6 that is good. 0.15 0.20 0.25 0.30 0.35 0.40 0.45 0.50....also
 * perfect. Anything else is a nightmare." Then, shown 0.1/0.25/0.5/0.75/1/
 * 1.25 for the exact same low/high/count: "it should look like that."
 *
 * The earlier version was already evenly spaced -- that was never the
 * problem. Evenly spaced just means every gap is IDENTICAL; it says
 * nothing about whether the gap itself is a number a person can hold in
 * their head. 0.23 is a perfectly even step and a genuinely bad one.
 *
 * The rule those three examples all satisfy: L1 is kept exactly as typed
 * -- it is often a floor picked for a real reason (LOD, lowest usable
 * signal), not a value that needs to look tidy next to its neighbours.
 * Every level after L1 is a plain multiple of ONE round unit (0.25 in the
 * "it should look like that" example, 0.1 and 0.05 in the two verbal
 * ones) -- computed from zero, not offset from L1. That is what let L1
 * sit at a non-multiple (0.1 is not a multiple of 0.25) while every level
 * after it still lands on a clean number.
 *
 * The unit itself is chosen to fit the range: nearest to (high - low) /
 * (count - 1) among the standard 1 / 2 / 2.5 / 5 / 10 x 10^n family,
 * favouring the unit that a pipettor's own detents already work in.
 */

/** The one rounding rule that applies everywhere in this app: 0.005 mg/mL. */
const CONC_GRID = 0.005;

export function roundToConcGrid(mgPerMl: number): number {
  return Math.round(mgPerMl / CONC_GRID) * CONC_GRID;
}

/** Nearest of 1, 2, 2.5, 5, 10 (times the matching power of ten) to `raw`. */
function niceUnit(raw: number): number {
  if (!(raw > 0)) return CONC_GRID;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const frac = raw / base;
  const candidates = [1, 2, 2.5, 5, 10];
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c - frac) < Math.abs(best - frac)) best = c;
  return roundToConcGrid(best * base);
}

/**
 * `count` levels from `lowMgPerMl` toward `highMgPerMl`. L1 is `low`,
 * unchanged. Every level after it is `i * unit` (i = 1, 2, 3...), a plain
 * multiple of one round unit picked to fit the requested range -- NOT an
 * offset added to `low`, and not forced to land exactly on `high`: a nice
 * unit that overshoots or undershoots the typed ceiling beats an ugly one
 * that hits it exactly. `count` of 1 returns just the low value.
 */
export function evenSpread(lowMgPerMl: number, highMgPerMl: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const low = roundToConcGrid(lowMgPerMl);
  if (n === 1) return [low];

  const rawStep = (highMgPerMl - lowMgPerMl) / (n - 1);
  const unit = niceUnit(rawStep);

  const out = [low];
  let floor = low;
  for (let i = 1; i < n; i++) {
    let v = roundToConcGrid(i * unit);
    // A nice unit can only ever collide with L1 (small low, coarse unit) --
    // levels 2+ are already strictly increasing multiples of the same unit
    // by construction. Guard it anyway rather than assume.
    if (v <= floor) v = roundToConcGrid(floor + unit);
    out.push(v);
    floor = v;
  }
  return out;
}

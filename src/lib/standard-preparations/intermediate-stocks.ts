/**
 * Intermediate stocks for calibration standard sets.
 *
 * A calibration ladder spans a wide concentration range from one primary
 * stock, so its low levels ask for very little stock: 0.005 mg/mL from a
 * 1 mg/mL primary into 1 mL is a 5 µL aliquot. That cannot be delivered
 * accurately, and the error it carries lands on the very levels the curve
 * is least able to absorb it.
 *
 * The builder used to flag those levels as infeasible and leave the analyst
 * to raise the batch volume. Dustin, 2026-08-31: "the solution is serial
 * dilution. When a 50ul cannot be met, it triggers a serial dilution."
 * So instead of refusing, this plans a weaker stock to draw them from.
 *
 * Two deliberate choices:
 *
 * Factors are powers of ten. A 45 µL aliquot could be fixed with a 2x
 * intermediate rather than a 10x one, and the resulting 90 µL would be
 * tidier than 450 µL -- but 450 µL is a perfectly good pipetting volume,
 * and "the 10x" is a thing an analyst can hold in their head, label, and
 * reuse. Odd factors multiply the number of distinct bottles on the bench
 * to buy accuracy that isn't in question.
 *
 * Each intermediate is made from the one above it, not from the primary.
 * That is what makes it a serial dilution: once the 10x exists, the 100x is
 * a single further transfer rather than two fresh ones off the primary.
 */
import { bestChain } from "@/lib/sample-prep/dilution";

/** Each intermediate is this much weaker than the one it's made from. */
const DECADE = 10;

/** Volumes an intermediate is made up to, smallest first, µL. */
const INTERMEDIATE_VOLUMES_UL = [1000, 2000, 5000, 10000];

/** Spare capacity over what the levels actually draw. */
const HEADROOM = 1.2;

export interface IntermediateStock {
  /** How many times weaker than the primary: 10, 100, ... */
  factor: number;
  concMgPerMl: number;
  /** Total volume made up, µL. */
  volumeUl: number;
  /** Aliquot of the source taken, µL. Source is the next stronger stock. */
  aliquotUl: number;
  diluentUl: number;
  /** Label of what this is made from — the primary, or the previous decade. */
  sourceLabel: string;
  /** How this stock is referred to on the grid and cut sheet. */
  label: string;
  /** What the levels actually draw from it, µL, before headroom. */
  drawnUl: number;
}

export interface LevelDraw {
  /** Volume to pipette, µL. Always >= the floor when `ok`. */
  volumeUl: number;
  /** null when drawn from the primary stock. */
  fromFactor: number | null;
  sourceLabel: string;
  /** False when even an intermediate can't bring this level into range. */
  ok: boolean;
}

export interface CompoundPlan {
  compoundId: string;
  intermediates: IntermediateStock[];
  /** Keyed by level index. */
  draws: Map<number, LevelDraw>;
}

export function primaryLabel(abbrev: string): string {
  return `${abbrev} primary`;
}
function intermediateLabel(abbrev: string, factor: number): string {
  return `${abbrev} 1:${factor}`;
}

/**
 * Smallest power of ten that lifts `aliquotUl` up to the pipette floor.
 * Returns 1 when the aliquot is already deliverable.
 */
function decadeFor(aliquotUl: number, floorUl: number): number {
  if (aliquotUl >= floorUl) return 1;
  const need = Math.ceil(Math.log10(floorUl / aliquotUl) - 1e-9);
  return Math.pow(DECADE, Math.max(1, need));
}

/**
 * Plans one compound's stocks across every level of the set.
 *
 * `concByLevel` holds the target concentration at each level index, or null
 * where this compound isn't present in that level.
 */
export function planCompoundStocks(args: {
  compoundId: string;
  abbrev: string;
  stockConcMgPerMl: number;
  batchUl: number;
  floorUl: number;
  concByLevel: Array<number | null>;
}): CompoundPlan {
  const { compoundId, abbrev, stockConcMgPerMl, batchUl, floorUl, concByLevel } = args;
  const draws = new Map<number, LevelDraw>();
  const drawnByFactor = new Map<number, number>();

  if (!(stockConcMgPerMl > 0) || !(batchUl > 0)) {
    return { compoundId, intermediates: [], draws };
  }

  concByLevel.forEach((conc, i) => {
    if (conc == null) return;
    const fromPrimary = (conc / stockConcMgPerMl) * batchUl;
    if (!(fromPrimary > 0)) return;

    const factor = decadeFor(fromPrimary, floorUl);
    const volumeUl = fromPrimary * factor;
    // A level whose aliquot would overflow the batch isn't rescued by a
    // weaker stock -- it's asking for more liquid than the vial holds.
    const ok = volumeUl >= floorUl && volumeUl <= batchUl;
    draws.set(i, {
      volumeUl,
      fromFactor: factor === 1 ? null : factor,
      sourceLabel: factor === 1 ? primaryLabel(abbrev) : intermediateLabel(abbrev, factor),
      ok,
    });
    if (factor > 1) drawnByFactor.set(factor, (drawnByFactor.get(factor) ?? 0) + volumeUl);
  });

  const deepest = Math.max(1, ...[...drawnByFactor.keys()]);
  const intermediates: IntermediateStock[] = [];

  // Every decade down to the deepest one needed gets made, including any
  // the levels never touch: the 100x is a dilution *of the 10x*, so the
  // 10x has to exist even if nothing draws from it directly.
  for (let factor = DECADE; factor <= deepest; factor *= DECADE) {
    const feedsNext = factor * DECADE <= deepest;
    const drawnUl = drawnByFactor.get(factor) ?? 0;

    // Provisional volume, then re-solved once the transfer out of this
    // stock into the next decade is known.
    let volumeUl = INTERMEDIATE_VOLUMES_UL[0];
    let aliquotUl = 0;
    for (let pass = 0; pass < 2; pass++) {
      const needed = (drawnUl + aliquotOutOf(volumeUl, feedsNext, floorUl)) * HEADROOM;
      volumeUl = INTERMEDIATE_VOLUMES_UL.find(v => v >= needed)
        ?? INTERMEDIATE_VOLUMES_UL[INTERMEDIATE_VOLUMES_UL.length - 1];
      const chain = bestChain(DECADE, volumeUl, floorUl, 1);
      aliquotUl = chain?.aliquots[0] ?? volumeUl / DECADE;
    }

    intermediates.push({
      factor,
      concMgPerMl: stockConcMgPerMl / factor,
      volumeUl,
      aliquotUl,
      diluentUl: Math.max(0, volumeUl - aliquotUl),
      sourceLabel: factor === DECADE
        ? primaryLabel(abbrev)
        : intermediateLabel(abbrev, factor / DECADE),
      label: intermediateLabel(abbrev, factor),
      drawnUl,
    });
  }

  return { compoundId, intermediates, draws };
}

/** How much this decade gives up to make the next one, µL. */
function aliquotOutOf(volumeUl: number, feedsNext: boolean, floorUl: number): number {
  if (!feedsNext) return 0;
  return bestChain(DECADE, volumeUl, floorUl, 1)?.aliquots[0] ?? volumeUl / DECADE;
}

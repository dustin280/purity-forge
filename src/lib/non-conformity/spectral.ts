/**
 * Spectral math for the Non-Conformity Identifier's DAD scoring — pure, no
 * I/O, mirroring engine.ts's style. Operates on a "fingerprint" (one
 * absorbance reading per configured DAD wavelength at a given retention
 * time), never on a candidate's stored reference spectrum, because the
 * library has no such reference data — only qualitative dad_discriminator
 * guidance text. What's computable without a reference library: how
 * similar a peak's spectrum is to the parent peak's (same-chromophore
 * baseline), and the compound's own curated channel ratios, both compared
 * against real numbers instead of assumed.
 */
import type { AgilentTrace } from "@/lib/lab-logs/agilent-trace";

export interface SpectralFingerprint {
  wavelengthsNm: number[];
  absorbance: number[];
}

/**
 * Builds a fingerprint by reading each channel's trace at the nearest point
 * to `rt`, within `toleranceMin`. Returns null if fewer than half the
 * channels have a point close enough — a partial fingerprint from a sparse
 * subset of channels isn't a meaningful spectral comparison.
 */
export function buildFingerprintAtRt(
  channels: { wavelengthNm: number; trace: AgilentTrace }[],
  rt: number,
  toleranceMin = 0.03,
): SpectralFingerprint | null {
  const wavelengthsNm: number[] = [];
  const absorbance: number[] = [];
  for (const { wavelengthNm, trace } of channels) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < trace.rt.length; i++) {
      const dist = Math.abs(trace.rt[i] - rt);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
      if (trace.rt[i] > rt + toleranceMin) break; // rt is monotonically increasing
    }
    if (bestIdx >= 0 && bestDist <= toleranceMin) {
      wavelengthsNm.push(wavelengthNm);
      absorbance.push(trace.vals[bestIdx]);
    }
  }
  if (wavelengthsNm.length < Math.ceil(channels.length / 2)) return null;
  return { wavelengthsNm, absorbance };
}

/** Cosine similarity over the wavelengths common to both fingerprints. Null if fewer than 2 overlap — not enough to mean anything. */
export function cosineSimilarity(a: SpectralFingerprint, b: SpectralFingerprint): number | null {
  const bByWavelength = new Map(b.wavelengthsNm.map((nm, i) => [nm, b.absorbance[i]]));
  const pairs: [number, number][] = [];
  for (let i = 0; i < a.wavelengthsNm.length; i++) {
    const bVal = bByWavelength.get(a.wavelengthsNm[i]);
    if (bVal != null) pairs.push([a.absorbance[i], bVal]);
  }
  if (pairs.length < 2) return null;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (const [x, y] of pairs) {
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return null;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface RatioSpec {
  label: string;
  numeratorNm: number;
  denominatorNm: number;
}

/** Extracts "A315/A280"-style ratio tokens from nc_spectral_panels.recommended_features free text (confirmed real seed shape, e.g. "A257/A214; A275/A214; ... ; full-spectrum cosine similarity"). Non-ratio items are simply not matched. */
export function parseRatioSpecs(recommendedFeatures: string | null): RatioSpec[] {
  if (!recommendedFeatures) return [];
  const specs: RatioSpec[] = [];
  const re = /A(\d+)\s*\/\s*A(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(recommendedFeatures))) {
    specs.push({ label: m[0], numeratorNm: Number(m[1]), denominatorNm: Number(m[2]) });
  }
  return specs;
}

function nearestAbsorbance(
  fp: SpectralFingerprint,
  nm: number,
  toleranceNm: number,
): number | null {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < fp.wavelengthsNm.length; i++) {
    const dist = Math.abs(fp.wavelengthsNm[i] - nm);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 && bestDist <= toleranceNm ? fp.absorbance[bestIdx] : null;
}

export interface ComputedRatio {
  label: string;
  value: number | null;
}

/** Computes each ratio spec against the nearest real DAD-configured channel within toleranceNm — the run's actual configured wavelengths rarely match a compound's recommended panel exactly, so exact equality would almost never hit. */
export function computeRatios(
  fp: SpectralFingerprint,
  specs: RatioSpec[],
  toleranceNm = 10,
): ComputedRatio[] {
  return specs.map((spec) => {
    const num = nearestAbsorbance(fp, spec.numeratorNm, toleranceNm);
    const den = nearestAbsorbance(fp, spec.denominatorNm, toleranceNm);
    return { label: spec.label, value: num != null && den != null && den !== 0 ? num / den : null };
  });
}

export type DadDiscriminatorDirection = "similar" | "altered" | "variable";

/** Classifies a candidate's free-text dad_discriminator guidance into a coarse direction — modeled on engine.ts's classifyRtDirection(), a documented heuristic over real seeded phrasing, not a validated parser. */
export function classifyDadDiscriminatorDirection(text: string | null): DadDiscriminatorDirection {
  if (!text) return "variable";
  const t = text.toLowerCase();
  const saysSimilar = /similar|unchanged|near-identical|near-parent|usually similar/.test(t);
  const saysAltered =
    /altered|new (near-uv )?(bands?|absorbance)|changes? strongly|different spectrum/.test(t);
  if (saysAltered && !saysSimilar) return "altered";
  if (saysSimilar && !saysAltered) return "similar";
  return "variable";
}

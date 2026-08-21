/**
 * Non-Conformity Identifier scoring engine — pure, no I/O.
 *
 * Implements the reference workbook's own "LIMS_Scoring" dual-weight model:
 * a DAD-only lab (Dustin's today) and a lab with LC-MS (coming) score the
 * same evidence differently. Mass-based components sit at weight 0 until a
 * peak actually carries an observed mass — nothing here ever claims more
 * certainty than the underlying data supports. Per the reference README's
 * own rule: a DAD/RT match supports a hypothesis, it never proves
 * structure — this engine's tier output reflects that (never "confirmed").
 */

import {
  cosineSimilarity,
  classifyDadDiscriminatorDirection,
  computeRatios,
  parseRatioSpecs,
  type SpectralFingerprint,
  type ComputedRatio,
} from "./spectral";

export type CandidateKind = "impurity" | "oligomer";
export type Tier = "candidate" | "probable_class" | "probable_identity";

export interface NcCandidateInput {
  id: string;
  kind: CandidateKind;
  name: string;
  evidenceLevel: string | null;
  rpHplcBehavior: string | null;
  massDelta: number | null;
  likelyTrigger: string | null;
  falsePositiveWarning?: string | null;
  dadDiscriminator?: string | null;
}

export interface PeakInput {
  peakId: string;
  rt: number;
  areaPct: number;
  peakPurity: number | null;
  peakPurityPassed: boolean | null;
  uvMatch: number | null;
  observedNeutralMass?: number | null;
  spectrum?: SpectralFingerprint | null;
}

export interface ComponentScores {
  rt: number;
  dadPurity: number;
  mass: number;
  isotopeAdduct: number;
  msms: number;
  stressContext: number;
  evidencePrior: number;
  total: number;
  maxPossible: number;
}

export interface DadSpectralDetail {
  cosineToParent: number;
  expectedDirection: ReturnType<typeof classifyDadDiscriminatorDirection>;
  ratios: ComputedRatio[];
}

export interface RankedCandidate {
  candidate: NcCandidateInput;
  scores: ComponentScores;
  tier: Tier;
  dadDetail?: DadSpectralDetail | null;
}

const WEIGHTS_DAD_ONLY = {
  rt: 30,
  dadPurity: 35,
  mass: 0,
  isotopeAdduct: 0,
  msms: 0,
  stressContext: 10,
  evidencePrior: 5,
};
const WEIGHTS_LC_MS = {
  rt: 15,
  dadPurity: 15,
  mass: 35,
  isotopeAdduct: 10,
  msms: 10,
  stressContext: 3,
  evidencePrior: 2,
};

const MASS_TOLERANCE_PPM = 20;
export const LOW_AREA_PCT_THRESHOLD = 0.1;

type RtDirection = "earlier" | "later" | "similar" | "variable";

/** Classifies a candidate's free-text RT guidance into a coarse direction — a documented heuristic, not a validated parser. */
function classifyRtDirection(guidance: string | null): RtDirection {
  if (!guidance) return "variable";
  const g = guidance.toLowerCase();
  const saysEarlier = /earlier|more polar/.test(g);
  const saysLater = /later|more (hydrophobic|retained)|broader/.test(g);
  const saysSimilar = /similar|unchanged|near-identical|near-parent/.test(g);
  if (saysEarlier && !saysLater) return "earlier";
  if (saysLater && !saysEarlier) return "later";
  if (saysSimilar) return "similar";
  return "variable";
}

function observedDirection(peakRt: number, parentRt: number): RtDirection {
  const ratio = peakRt / parentRt;
  if (ratio < 0.98) return "earlier";
  if (ratio > 1.02) return "later";
  return "similar";
}

function scoreRt(
  peak: PeakInput,
  parentRt: number,
  candidate: NcCandidateInput,
  weight: number,
): number {
  if (weight === 0) return 0;
  const expected = classifyRtDirection(candidate.rpHplcBehavior);
  if (expected === "variable") return weight * 0.5;
  const observed = observedDirection(peak.rt, parentRt);
  return observed === expected ? weight : weight * 0.15;
}

/**
 * DAD component uses OpenLab's own peak_purity/uv_match scores as the
 * practical proxy for "full DAD spectral similarity" — no per-wavelength
 * spectrum is captured today (see engine plan notes). It scores the peak's
 * general spectral trustworthiness, not a candidate-specific spectral
 * fingerprint match — the library has no stored reference spectra to
 * compare against yet.
 */
function scoreDadPurity(peak: PeakInput, weight: number): number {
  if (weight === 0) return 0;
  if (peak.peakPurityPassed === false) return weight * 0.8; // spectral impurity is itself flag-worthy
  if (peak.uvMatch != null) return weight * Math.min(1, peak.uvMatch / 1000);
  if (peak.peakPurityPassed === true) return weight * 0.6;
  return weight * 0.3; // no DAD data at all for this peak
}

/**
 * Real spectral scoring, used once a peak and its parent both carry a
 * SpectralFingerprint (built from actual DAD .CH channel data — see
 * dx-spectral.functions.ts). Scores agreement between the candidate's
 * dad_discriminator guidance (classified "similar"/"altered"/"variable")
 * and the observed cosine similarity to the parent peak's spectrum: a
 * candidate expecting an unchanged chromophore is supported by high
 * similarity, one expecting a new/altered chromophore is supported by low
 * similarity. "variable" guidance can't be checked either way and scores
 * neutrally. Falls back to the existing proxy score whenever spectral data
 * is missing for either peak — never a hard requirement.
 */
function scoreDadPuritySpectral(
  peak: PeakInput,
  parentSpectrum: SpectralFingerprint | null | undefined,
  candidate: NcCandidateInput,
  spectralPanel: { wavelengthsNm: number[]; recommendedFeatures: string | null } | null | undefined,
  weight: number,
): { score: number; detail: DadSpectralDetail | null } {
  if (weight === 0) return { score: 0, detail: null };
  if (!peak.spectrum || !parentSpectrum)
    return { score: scoreDadPurity(peak, weight), detail: null };

  const rawCosine = cosineSimilarity(peak.spectrum, parentSpectrum);
  if (rawCosine == null) return { score: scoreDadPurity(peak, weight), detail: null };
  const cosine = Math.max(0, Math.min(1, rawCosine)); // absorbance is physically non-negative; clamp defensively against baseline noise

  const expected = classifyDadDiscriminatorDirection(candidate.dadDiscriminator ?? null);
  const ratios = computeRatios(
    peak.spectrum,
    parseRatioSpecs(spectralPanel?.recommendedFeatures ?? null),
  );
  const detail: DadSpectralDetail = { cosineToParent: cosine, expectedDirection: expected, ratios };

  if (expected === "variable") return { score: weight * 0.5, detail };
  if (expected === "similar") return { score: weight * cosine, detail };
  // expected === "altered": low cosine (dissimilar spectrum) supports the hypothesis.
  return { score: weight * (1 - cosine), detail };
}

function scoreMass(
  peak: PeakInput,
  parentMonoisotopicMass: number | null,
  candidate: NcCandidateInput,
  weight: number,
): number {
  if (weight === 0) return 0;
  if (
    peak.observedNeutralMass == null ||
    parentMonoisotopicMass == null ||
    candidate.massDelta == null
  )
    return 0;
  const expected = parentMonoisotopicMass + candidate.massDelta;
  const ppmError = Math.abs((peak.observedNeutralMass - expected) / expected) * 1_000_000;
  if (ppmError > MASS_TOLERANCE_PPM * 5) return 0;
  if (ppmError <= MASS_TOLERANCE_PPM) return weight;
  return weight * Math.max(0, 1 - (ppmError - MASS_TOLERANCE_PPM) / (MASS_TOLERANCE_PPM * 4));
}

const EVIDENCE_LEVEL_SCORE: Record<string, number> = {
  "reported/known": 1,
  "strongly plausible": 0.75,
  "generic chemistry candidate": 0.4,
  "synthesis-related impurity": 0.5,
  "identity/form ambiguity": 0.5,
  "instrumental possibility": 0.15,
};

function scoreEvidencePrior(evidenceLevel: string | null, weight: number): number {
  if (weight === 0 || !evidenceLevel) return 0;
  const key = evidenceLevel.trim().toLowerCase();
  return weight * (EVIDENCE_LEVEL_SCORE[key] ?? 0.3);
}

function scoreStressContext(
  stressContext: string | null,
  likelyTrigger: string | null,
  weight: number,
): number {
  if (weight === 0 || !stressContext || !likelyTrigger) return 0;
  const stressWords = stressContext
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const triggerText = likelyTrigger.toLowerCase();
  const hit = stressWords.some((w) => triggerText.includes(w));
  return hit ? weight : 0;
}

function tierFor(scores: ComponentScores, hasObservedMass: boolean): Tier {
  const pct = scores.total / scores.maxPossible;
  if (hasObservedMass && scores.mass > 0 && pct >= 0.7) return "probable_identity";
  if (pct >= 0.55) return "probable_class";
  return "candidate";
}

export function rankCandidatesForPeak(args: {
  peak: PeakInput;
  parentPeakRt: number;
  parentMonoisotopicMass: number | null;
  candidates: NcCandidateInput[];
  stressContext: string | null;
  parentSpectrum?: SpectralFingerprint | null;
  spectralPanel?: { wavelengthsNm: number[]; recommendedFeatures: string | null } | null;
}): RankedCandidate[] {
  const {
    peak,
    parentPeakRt,
    parentMonoisotopicMass,
    candidates,
    stressContext,
    parentSpectrum,
    spectralPanel,
  } = args;
  const hasObservedMass = peak.observedNeutralMass != null;
  const weights = hasObservedMass ? WEIGHTS_LC_MS : WEIGHTS_DAD_ONLY;

  const ranked = candidates.map((candidate): RankedCandidate => {
    const rt = scoreRt(peak, parentPeakRt, candidate, weights.rt);
    const { score: dadPurity, detail: dadDetail } = scoreDadPuritySpectral(
      peak,
      parentSpectrum,
      candidate,
      spectralPanel,
      weights.dadPurity,
    );
    const mass = scoreMass(peak, parentMonoisotopicMass, candidate, weights.mass);
    const stressContextScore = scoreStressContext(
      stressContext,
      candidate.likelyTrigger,
      weights.stressContext,
    );
    const evidencePrior = scoreEvidencePrior(candidate.evidenceLevel, weights.evidencePrior);
    const maxPossible =
      weights.rt +
      weights.dadPurity +
      weights.mass +
      weights.isotopeAdduct +
      weights.msms +
      weights.stressContext +
      weights.evidencePrior;
    const total = rt + dadPurity + mass + stressContextScore + evidencePrior;
    const scores: ComponentScores = {
      rt,
      dadPurity,
      mass,
      isotopeAdduct: 0,
      msms: 0,
      stressContext: stressContextScore,
      evidencePrior,
      total,
      maxPossible,
    };
    return { candidate, scores, tier: tierFor(scores, hasObservedMass), dadDetail };
  });

  return ranked.sort((a, z) => z.scores.total - a.scores.total);
}

export interface NextStepSuggestion {
  text: string;
  sourceRuleId?: string;
}

/**
 * Generates concrete next-actions from the same reference data used to
 * score — not a separate AI layer. Every suggestion names the rule/panel
 * it came from.
 */
export function generateNextSteps(args: {
  topCandidates: RankedCandidate[];
  spectralPanel?: { wavelengthsNm: number[]; recommendedFeatures: string | null } | null;
  hasObservedMass: boolean;
  hasRealSpectrum?: boolean;
}): NextStepSuggestion[] {
  const { topCandidates, spectralPanel, hasObservedMass, hasRealSpectrum } = args;
  const suggestions: NextStepSuggestion[] = [];

  if (topCandidates.length >= 2) {
    const [top, second] = topCandidates;
    if (top.scores.total - second.scores.total < top.scores.maxPossible * 0.1) {
      if (hasRealSpectrum && top.dadDetail) {
        const ratioText = top.dadDetail.ratios
          .filter((r) => r.value != null)
          .map((r) => `${r.label}=${r.value!.toFixed(2)}`)
          .join(", ");
        suggestions.push({
          text:
            `Top candidates ("${top.candidate.name}" vs "${second.candidate.name}") are close in score. ` +
            `Real DAD spectral data: cosine similarity to the parent peak is ${top.dadDetail.cosineToParent.toFixed(2)}` +
            (ratioText ? `; computed ratios — ${ratioText}` : "") +
            ". Compare against each candidate's DAD guidance to help discriminate.",
        });
      } else {
        suggestions.push({
          text:
            `Top candidates ("${top.candidate.name}" vs "${second.candidate.name}") are close in score. ` +
            (spectralPanel && spectralPanel.wavelengthsNm.length
              ? `This compound's spectral panel recommends monitoring ${spectralPanel.wavelengthsNm.join("/")} nm` +
                (spectralPanel.recommendedFeatures
                  ? ` and tracking ${spectralPanel.recommendedFeatures}`
                  : "") +
                " — consider re-injection with that channel set to help discriminate."
              : "Consider re-injection with a broader wavelength set to help discriminate."),
        });
      }
    }
  }

  const oligomerHit = topCandidates.find((c) => c.candidate.kind === "oligomer");
  if (oligomerHit) {
    suggestions.push({
      text:
        `"${oligomerHit.candidate.name}" is an oligomer/aggregation candidate — RP-HPLC/DAD alone cannot confirm this class. ` +
        "Consider a reducing-agent (DTT/TCEP) challenge if a disulfide dimer is plausible, a dilution series to test for an ESI source-cluster artifact, or an orthogonal size-based method (SEC/DLS/native MS) if a physical aggregate is suspected.",
      sourceRuleId: oligomerHit.candidate.id,
    });
  }

  if (!hasObservedMass && topCandidates.length > 0 && topCandidates[0].tier !== "candidate") {
    suggestions.push({
      text:
        "This finding scored high enough to be worth confirming — no mass data is on record for this peak. " +
        "If LC-MS becomes available, targeting the mass delta of the top candidate would let this move from a DAD-only hypothesis toward a confirmable identity.",
    });
  }

  return suggestions;
}

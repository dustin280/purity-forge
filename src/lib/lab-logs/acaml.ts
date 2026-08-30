/**
 * Parser for Agilent ACAML (Analytical Chemistry Analysis Markup Language),
 * the structured results format behind Cal Std / QC Check injections.
 *
 * Two distinct files, both XML wrapped in a small zip archive alongside the
 * `.rslt` sequence's raw `.dx` traces:
 *
 *   - `<sequence name>.acaml` — one per sequence, lists every injection with
 *     its SampleName, SampleType ("Blank"/"Calibration"/...), and (for
 *     calibration injections) a literal CalibrationLevel. `parseSequenceManifest`
 *     handles this half — verified directly against two real sequence files
 *     pulled from the lab's own Drive folder (decoded, unzipped, read).
 *
 *   - `<timestamp>-<n>.rx` — one per injection, referenced from the sequence
 *     manifest's `ExternalResultPath`, holding the actual integrated peak
 *     table once the lab has linked a processing method and reviewed it in
 *     OpenLab CDS. `parseInjectionResult` handles this half.
 *
 * Both halves are now validated against real files from the lab's own Drive.
 * `parseInjectionResult` was originally written from Agilent's documented
 * conventions, because every `.rx` to hand at the time reported
 * `NoMethodProvided` (integration not yet run). Re-derived 2026-08-29 from
 * genuinely integrated GHK-Cu calibration injections, which showed the
 * documented guess had the shape wrong -- see that function's own note.
 */

export interface AcamlInjection {
  injectionId: string;
  sampleName: string;
  sampleType: string | null;
  calibrationLevel: number | null;
  acqMethodName: string | null;
  rawDataFileName: string | null;
  acqDateTime: string | null;
  sequenceName: string;
}

function attrValue(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * Every field but CalibrationLevel is an XML attribute on <InjectionMetaData>
 * itself (confirmed against real files); CalibrationLevel is the one child
 * element, present only on calibration-type injections:
 *   <InjectionMetaData ... SampleName="..." SampleType="Calibration" ...>
 *     <CalibrationLevel val="1" />
 *     ...
 *   </InjectionMetaData>
 */
export function parseSequenceManifest(xml: string): { sequenceName: string | null; injections: AcamlInjection[] } {
  const descMatch = xml.match(/<Description>([^<]*)<\/Description>/);
  const injections: AcamlInjection[] = [];
  const blockRe = /<InjectionMetaData\b([^>]*)>([\s\S]*?)<\/InjectionMetaData>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml))) {
    const attrs = m[1];
    const inner = m[2];
    const injectionId = attrValue(attrs, "InjectionId");
    const sampleName = attrValue(attrs, "SampleName");
    const sequenceName = attrValue(attrs, "SequenceName");
    if (!injectionId || sampleName === null || !sequenceName) continue;
    const levelMatch = inner.match(/<CalibrationLevel val="(\d+)"/);
    injections.push({
      injectionId,
      sampleName,
      sampleType: attrValue(attrs, "SampleType"),
      calibrationLevel: levelMatch ? Number(levelMatch[1]) : null,
      acqMethodName: attrValue(attrs, "AcqMethodName"),
      rawDataFileName: attrValue(attrs, "RawDataFileName"),
      acqDateTime: attrValue(attrs, "InjectionAcqDateTime"),
      sequenceName,
    });
  }
  return { sequenceName: descMatch ? descMatch[1] : null, injections };
}

export interface AcamlPeak {
  compound: string;
  rt: number;
  area: number | null;
  amount: number | null;
  /** Detector response in mAU — what calibration ranges are actually set from. */
  height: number | null;
  areaPercent: number | null;
  heightPercent: number | null;
  /** Peak symmetry; <0.9 or >1.2 is worth a look before trusting the result. */
  symmetry: number | null;
  /** Response / amount, as OpenLab computed it. Flat across levels = linear. */
  responseFactor: number | null;
  /** The level's NOMINAL concentration on a calibration injection. */
  calibrationAmount: number | null;
  /** "Expected" for an identified compound, "Unknown" for an unnamed peak. */
  identificationType: string | null;
}

export interface AcamlInjectionResult {
  integrated: boolean;
  peaks: AcamlPeak[];
}

const NOT_INTEGRATED_STATES = ["nomethodprovided", "failed"];

/** ACAML numbers are attributes and can be negative or exponential. */
const NUM = String.raw`(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)`;

function attrNum(block: string, tag: string): number | null {
  // Boundary is a negative lookahead rather than a word-boundary escape, on
  // purpose. Inside a template literal a lone backslash-b is the BACKSPACE
  // character, so the pattern silently hunts for a tag name followed by a
  // control code and matches nothing at all -- a whole parser returning zero
  // rows with no error. Requiring the next character not to be a letter needs
  // no escape, and still stops "<Area" matching "<AreaPercent", which would
  // otherwise read a completely different number.
  const m = block.match(new RegExp(`<${tag}(?![A-Za-z])[^>]*val="${NUM}"`));
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function elText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

/**
 * Extracts one injection's integrated results.
 *
 * Validated 2026-08-29 against real GHK-Cu calibration `.rx` files from the
 * lab's Drive, replacing a version written from documented conventions when
 * every file to hand said `NoMethodProvided`. The old shape was wrong in a
 * way that returned nothing rather than something incorrect: it looked for a
 * compound name INSIDE each `<Peak>`, and the name does not live there, so
 * every peak failed its `if (!compound) continue` guard and every injection
 * reported zero peaks.
 *
 * The real layout is two parallel lists joined by id:
 *
 *   <SignalResult><Peak id="..">   RetentionTime, Area (mAU*s), AreaPercent,
 *                                  Height (mAU), HeightPercent, Symmetry
 *   <InjectionCompound>            CompoundName, Type, Amount, Area, Height,
 *                                  ResponseFactor, CalibrationAmount, and
 *                                  <Peak_ID id=".."> pointing at its peak
 *
 * Peak height is the whole reason this matters: calibration ranges are set
 * from mAU (see reference-hplc-calibration-quantitation), and it was the one
 * field the previous parser never captured.
 */
export function parseInjectionResult(xml: string): AcamlInjectionResult {
  const stateMatch = xml.match(/<TransformationChainState>([^<]*)<\/TransformationChainState>/);
  const state = (stateMatch?.[1] ?? "").toLowerCase();
  if (NOT_INTEGRATED_STATES.some((s) => state.includes(s))) {
    return { integrated: false, peaks: [] };
  }

  // Chromatographic peaks, keyed by id so compounds can point at them.
  type RawPeak = {
    rt: number | null; area: number | null; height: number | null;
    areaPercent: number | null; heightPercent: number | null; symmetry: number | null;
  };
  const peakById = new Map<string, RawPeak>();
  const peakRe = /<Peak\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/Peak>/g;
  let pm: RegExpExecArray | null;
  while ((pm = peakRe.exec(xml))) {
    const [, id, block] = pm;
    peakById.set(id, {
      rt: attrNum(block, "RetentionTime"),
      area: attrNum(block, "Area"),
      height: attrNum(block, "Height"),
      areaPercent: attrNum(block, "AreaPercent"),
      heightPercent: attrNum(block, "HeightPercent"),
      symmetry: attrNum(block, "Symmetry"),
    });
  }

  const peaks: AcamlPeak[] = [];
  const compRe = /<InjectionCompound(?![A-Za-z])[^>]*>([\s\S]*?)<\/InjectionCompound>/g;
  let cm: RegExpExecArray | null;
  while ((cm = compRe.exec(xml))) {
    const block = cm[1];
    const name = (elText(block, "CompoundName") ?? "").trim();
    if (!name) continue;   // unnamed peaks are noise, not results

    // Prefer the peak marked as this compound's Main quantitation peak.
    const refs = [...block.matchAll(/<Peak_ID\s+id="([^"]+)"[^>]*?(?:calibPeakRole="([^"]*)")?[^>]*\/>/g)]
      .map((m) => ({ id: m[1], role: m[2] ?? "" }));
    const chosen = refs.find((r) => /main/i.test(r.role)) ?? refs[0];
    const peak = chosen ? peakById.get(chosen.id) : undefined;

    // Compound-level Area/Height are the quantitation values; the peak's own
    // are the raw chromatographic ones. Prefer the compound's, fall back.
    peaks.push({
      compound: name,
      rt: peak?.rt ?? attrNum(block, "ExpectedRetTime") ?? 0,
      area: attrNum(block, "Area") ?? peak?.area ?? null,
      amount: attrNum(block, "Amount"),
      height: attrNum(block, "Height") ?? peak?.height ?? null,
      areaPercent: peak?.areaPercent ?? null,
      heightPercent: peak?.heightPercent ?? null,
      symmetry: peak?.symmetry ?? null,
      responseFactor: attrNum(block, "ResponseFactor"),
      calibrationAmount: attrNum(block, "CalibrationAmount"),
      identificationType: elText(block, "Type"),
    });
  }

  return { integrated: peaks.length > 0, peaks };
}

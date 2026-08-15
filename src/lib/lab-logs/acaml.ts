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
 * IMPORTANT: every `.rx` file inspected while building this (two different
 * sequences) had an EMPTY peak-results section with
 * `<ProcessingStatus><TransformationChainState>NoMethodProvided</TransformationChainState>` —
 * meaning peak integration hadn't been done yet for those particular runs.
 * `parseInjectionResult` reliably detects and reports that state (verified).
 * The peak-extraction path for an actually-integrated result is built
 * against Agilent's documented ACAML conventions rather than a confirmed
 * real example — flag any mismatch found once real integrated data is
 * available and adjust the alias lists below, the same way the xlsx report
 * parser in drive-reports.functions.ts was tuned after the fact.
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
}

export interface AcamlInjectionResult {
  integrated: boolean;
  peaks: AcamlPeak[];
}

const NOT_INTEGRATED_STATES = ["nomethodprovided", "failed"];

/**
 * Peak-extraction path is unvalidated (see module docstring) — scans for
 * several plausible ACAML peak-element shapes rather than committing to one,
 * and falls back to `integrated: false` (never fabricates a row) if nothing
 * recognizable is found even when ProcessingStatus doesn't explicitly say
 * "not integrated."
 */
export function parseInjectionResult(xml: string): AcamlInjectionResult {
  const stateMatch = xml.match(/<TransformationChainState>([^<]*)<\/TransformationChainState>/);
  const state = (stateMatch?.[1] ?? "").toLowerCase();
  if (NOT_INTEGRATED_STATES.some((s) => state.includes(s))) {
    return { integrated: false, peaks: [] };
  }

  const peaks: AcamlPeak[] = [];
  const peakBlockRe = /<(?:Peak|PeakResult|CompoundResult)\b[^>]*>([\s\S]*?)<\/(?:Peak|PeakResult|CompoundResult)>/g;
  let m: RegExpExecArray | null;
  while ((m = peakBlockRe.exec(xml))) {
    const block = m[1];
    const compound =
      block.match(/<(?:Name|CompoundName|Identity)>([^<]*)<\/(?:Name|CompoundName|Identity)>/)?.[1] ?? null;
    const rtMatch = block.match(/<(?:RT|RetentionTime)[^>]*val="([\d.]+)"/) ??
      block.match(/<(?:RT|RetentionTime)>([\d.]+)<\/(?:RT|RetentionTime)>/);
    const areaMatch = block.match(/<Area[^>]*val="([\d.]+)"/) ?? block.match(/<Area>([\d.]+)<\/Area>/);
    const amountMatch = block.match(/<Amount[^>]*val="([\d.]+)"/) ?? block.match(/<Amount>([\d.]+)<\/Amount>/);
    if (!compound || !rtMatch) continue;
    peaks.push({
      compound,
      rt: Number(rtMatch[1]),
      area: areaMatch ? Number(areaMatch[1]) : null,
      amount: amountMatch ? Number(amountMatch[1]) : null,
    });
  }

  return { integrated: peaks.length > 0, peaks };
}

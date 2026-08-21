/**
 * Parser for Agilent OpenLab CDS raw instrument trace data.
 *
 * Each `.dx` file pulled off Drive for a run is actually a zip archive
 * (`injection.acmd` XML manifest + one binary file per detector/pump
 * channel). This module only handles the two pieces once that archive has
 * already been unzipped elsewhere (src/lib/lab-logs/pressure-watcher.functions.ts):
 *   - `injection.acmd`, a small XML manifest listing every channel
 *     (Description/DeviceName/Units/TraceId) plus run-level info
 *     (SampleName/RunDateTime/RunOperator/AcquisitionMethod).
 *   - `${traceId}.IT`, one binary trace per channel — version-179 "OL"
 *     (OpenLab) format.
 *
 * The `.IT` byte layout below was reverse-engineered and validated against
 * a real file (a PMP1B "Pressure" channel, units bar): decoded point count
 * and scaling factor matched the file's own embedded metadata exactly, and
 * the resulting values were labeled "bar" and fell in a plausible HPLC
 * back-pressure range. It was also cross-checked against the open-source
 * chromConverter R package's `read_chemstation_it` parser (version "179",
 * filetype "OL", 8-byte double-array encoding), which independently
 * documents the same offsets. Uses DataView/Uint8Array only (no `Buffer`
 * dependency) so it behaves identically whether or not the Workers runtime
 * has `nodejs_compat` enabled.
 */

function readCsString(view: DataView, pos: number, encoding: 1 | 2): string {
  const n = view.getUint8(pos);
  const start = pos + 1;
  let s = "";
  const stride = encoding === 1 ? 1 : 2;
  for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(start + i * stride));
  return s;
}

const IT_OFFSETS = {
  file_type: 347,
  intercept: 4724,
  scaling_factor: 4732,
  data_start: 6144,
};

export interface AgilentTrace {
  /** Retention time in minutes, monotonically increasing. */
  rt: number[];
  /** Scaled channel value (units per the manifest's Signal.units, e.g. bar, mL/min, °C). */
  vals: number[];
}

export function parseAgilentIT(buf: ArrayBuffer): AgilentTrace {
  const view = new DataView(buf);
  const version = readCsString(view, 0, 1);
  if (version !== "179") {
    throw new Error(
      `Unsupported Agilent trace version "${version}" (only 179/OpenLab is supported)`,
    );
  }
  const filetype = readCsString(view, IT_OFFSETS.file_type, 2).slice(0, 2);
  if (filetype !== "OL") {
    throw new Error(
      `Unsupported Agilent trace filetype "${filetype}" (only OpenLab "OL" files are supported)`,
    );
  }

  let intercept = view.getFloat64(IT_OFFSETS.intercept, false);
  if (Number.isNaN(intercept)) intercept = 0;
  const scalingFactor = view.getFloat64(IT_OFFSETS.scaling_factor, false);

  const n = Math.floor((buf.byteLength - IT_OFFSETS.data_start) / 8);
  const rt: number[] = [];
  const vals: number[] = [];
  // Raw payload is interleaved (time_ms, value) float64 pairs, little-endian.
  for (let i = 0; i + 1 < n; i += 2) {
    const t = view.getFloat64(IT_OFFSETS.data_start + i * 8, true);
    const v = view.getFloat64(IT_OFFSETS.data_start + (i + 1) * 8, true);
    rt.push(t / 60000);
    vals.push(v * scalingFactor + intercept);
  }
  return { rt, vals };
}

const CH_OFFSETS = {
  scaling_factor: 0x127c,
  data_start: 0x1800,
};

/**
 * Parser for the `.CH` UV/CAD/ELSD single-wavelength variant used for DAD
 * absorbance channels (e.g. `DAD1A.CH`) — a different binary encoding than
 * the `.IT` format above, even though both files share the same 6144-byte
 * header length. Confirmed against a real .dx file: the manifest's DAD1A-H
 * (absorbance) signals resolve to `${traceId}.CH` files, not `.IT` — only
 * DAD's housekeeping signals (lamp voltage, optical/board temperature) are
 * `.IT`, same as PMP/THM.
 *
 * The delta-encoded segment body documented by the `rainbow` project's
 * "other" .ch format does NOT match this file's real bytes (confirmed live:
 * the byte at 0x1800 isn't the 0x10 segment label the spec assumes). The
 * actual body, read directly off a real file, is a flat sequential array of
 * little-endian float64 values from 0x1800 to EOF — no delta encoding, no
 * per-point timestamp. Two real channels decoded this way produced
 * physically plausible small mAU-scale values (one a smooth rising
 * baseline), while the delta-segment reading produced zero points across
 * every channel. The scaling factor at 0x127c (float64, big-endian) is
 * shared with the `.IT` header at the same offset and decoded to a clean
 * power-of-two (2^-21) — a strong signal that offset is correct.
 *
 * RT axis: TEMPORARY — nothing found in this file's own header reliably
 * encodes the real time bounds yet (the byte layout the `rainbow` spec
 * documents for that doesn't hold here either, same as the body). `rt` is
 * currently just the raw point index, not real minutes; a live diagnostic
 * scan is in flight (dx-link.functions.ts `scanForPlausibleFields`) to find
 * the real offset before this is wired into any real scoring.
 */
export function parseAgilentChDelta(buf: ArrayBuffer): AgilentTrace {
  const view = new DataView(buf);
  const scalingFactor = view.getFloat64(CH_OFFSETS.scaling_factor, false);
  const n = Math.floor((buf.byteLength - CH_OFFSETS.data_start) / 8);

  const rt: number[] = [];
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    rt.push(i);
    vals.push(view.getFloat64(CH_OFFSETS.data_start + i * 8, true) * scalingFactor);
  }
  return { rt, vals };
}

/** Mean of all values whose retention time falls within [0, maxMinutes]. Falls back to the first point if the window is empty. */
export function meanInWindow(trace: AgilentTrace, maxMinutes: number): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < trace.rt.length; i++) {
    if (trace.rt[i] > maxMinutes) break; // rt is monotonically increasing
    sum += trace.vals[i];
    count++;
  }
  if (count > 0) return sum / count;
  return trace.vals.length > 0 ? trace.vals[0] : null;
}

export function minMax(vals: number[]): { min: number | null; max: number | null } {
  if (vals.length === 0) return { min: null, max: null };
  let min = vals[0];
  let max = vals[0];
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export interface AgilentSignal {
  device: string;
  channel: string;
  desc: string;
  units: string;
  traceId: string;
}

export interface InjectionManifest {
  sampleName: string | null;
  runDateTime: string | null;
  runOperator: string | null;
  acquisitionMethod: string | null;
  signals: AgilentSignal[];
}

function tagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * Regex-based extraction rather than a full XML parser — deliberate and
 * consistent with this codebase's other instrument-file parsers
 * (src/lib/results/drive-reports.functions.ts anchors on fixed tokens in
 * report text rather than pulling in a heavier parsing library), and the
 * manifest's shape is small and fixed enough that this is reliable.
 */
export function parseInjectionManifest(xml: string): InjectionManifest {
  const signals: AgilentSignal[] = [];
  const signalRe = /<Signal>([\s\S]*?)<\/Signal>/g;
  let m: RegExpExecArray | null;
  while ((m = signalRe.exec(xml))) {
    const block = m[1];
    signals.push({
      device: tagValue(block, "DeviceName") ?? "",
      channel: tagValue(block, "ChannelName") ?? "",
      desc: tagValue(block, "Description") ?? "",
      units: tagValue(block, "Units") ?? "",
      traceId: tagValue(block, "TraceId") ?? "",
    });
  }
  return {
    sampleName: tagValue(xml, "SampleName"),
    runDateTime: tagValue(xml, "RunDateTime"),
    runOperator: tagValue(xml, "RunOperator"),
    acquisitionMethod: tagValue(xml, "AcquisitionMethod"),
    signals,
  };
}

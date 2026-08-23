/**
 * Pure optimizer for the Run List Generator. No I/O; feed it samples,
 * method groups, and available tray positions — get back QC-interleaved
 * sequences with vial assignments and a short "why" trace.
 */
import { isQcLocation, tryParseVialLocation, type VialLocation } from "./vial-location";

export interface OptimizerSample {
  id: string;
  batch_id: string;
  compound: string | null;
  method_group_id: string | null;
  lot: string | null;
  /** Free-text concentration from intake, e.g. "20 mg/mL", "100 ug/mL". */
  concentration?: string | null;
}

export interface OptimizerMethodGroup {
  id: string;
  name: string;
  temperature_c: number;
  priority: number;
  default_acquisition_method: string | null;
  default_processing_method: string | null;
}

export interface OptimizerTrayPosition {
  position_code: string;
}

export type SequenceRowType =
  | "NIB" | "ICB" | "ICV" | "CCB" | "CCV" | "Sample";

export interface SequenceRow {
  type: SequenceRowType;
  label: string;                 // display name / sample name
  sample_id: string | null;      // real sample rows only
  lot: string | null;            // sample lot (null for QC rows)
  method_group_id: string | null;
  method_group_name: string | null;
  acquisition_method: string | null;
  processing_method: string | null;
  vial: string | null;
  level: string | null;          // calibration level, e.g. CCV rows run at Level 3
  why: string;                   // rationale for review UI
  /** C6: preview-time prep-coverage warning for this row's sample, null/absent when fine. Attached after optimize() runs — not set here. */
  prep_warning?: "no_prep" | "not_approved" | "expired" | null;
  /** A5: which standard_preparation_logs row backs this QC row (NIB/ICB/ICV/CCB/CCV) — picked by the analyst on the review screen, not set here. */
  standard_prep_id?: string | null;
  standard_label?: string | null;
}

export interface OptimizedSequence {
  index: number;                 // 1-based within the run
  name: string;                  // human name
  primary_group_id: string | null;
  temperature_c: number | null;
  rows: SequenceRow[];
}

const MAX_SAMPLES_PER_SEQ = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Parse a free-text concentration into mg/mL — used only as the final
 * tie-breaker within a compound's Syx ID ordering. Unparseable / missing
 * values sort to the end (Infinity).
 */
function parseConcentrationMgPerMl(v: string | null | undefined): number {
  if (!v) return Number.POSITIVE_INFINITY;
  const s = String(v).trim();
  const m = s.match(/([-+]?\d*\.?\d+)\s*([a-zµμ%/]*)/i);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  const unit = (m[2] || "").toLowerCase();
  if (/^(µg|ug|mcg)\/?(ml|ml\.)?$/.test(unit) || unit === "µg/ml" || unit === "ug/ml") return n / 1000;
  if (/^ng\/?(ml)?$/.test(unit)) return n / 1_000_000;
  if (/^g\/?(ml|l)?$/.test(unit)) return unit.includes("l") && !unit.includes("ml") ? n / 1000 : n * 1000;
  return n;
}

/**
 * Build the fixed QC pattern around up to 30 samples. Every QC/blank row
 * carries the same acquisition/processing method as the samples it's
 * bracketing — a run never mixes method groups (see the packing logic in
 * optimize() below), so there's exactly one group to inherit from.
 */
function withQC(
  samples: OptimizerSample[],
  groupById: Map<string, OptimizerMethodGroup>,
  vialFor: (kind: "qc" | "sample") => string | null,
  runGroup: OptimizerMethodGroup | null,
): SequenceRow[] {
  const rows: SequenceRow[] = [];
  const push = (type: SequenceRowType, label: string, isQc: boolean, extra?: Partial<SequenceRow>) => {
    rows.push({
      type, label, sample_id: null,
      lot: null,
      method_group_id: runGroup?.id ?? null, method_group_name: runGroup?.name ?? null,
      acquisition_method: runGroup?.default_acquisition_method ?? null,
      processing_method: runGroup?.default_processing_method ?? null,
      vial: vialFor(isQc ? "qc" : "sample"),
      level: null,
      why: extra?.why ?? `${type} QC`,
      ...extra,
    });
  };
  push("NIB", "NIB", true);
  push("ICB", "ICB", true);
  push("ICV", "ICV", true);

  const blocks = chunk(samples, 10);
  blocks.forEach((block, bi) => {
    block.forEach((s) => {
      const g = s.method_group_id ? groupById.get(s.method_group_id) ?? null : null;
      const lotSuffix = s.lot ? ` (Lot: ${s.lot})` : "";
      const conc = s.concentration ? ` @ ${s.concentration}` : "";
      rows.push({
        type: "Sample",
        label: s.batch_id + (s.compound ? ` — ${s.compound}` : "") + conc + lotSuffix,
        sample_id: s.id,
        lot: s.lot ?? null,
        method_group_id: g?.id ?? null,
        method_group_name: g?.name ?? null,
        acquisition_method: g?.default_acquisition_method ?? null,
        processing_method: g?.default_processing_method ?? null,
        vial: vialFor("sample"),
        level: null,
        why: [
          s.compound ? `Compound ${s.compound}` : "No compound",
          s.concentration ? `conc ${s.concentration}` : "no concentration",
          g ? `${g.name} (${g.temperature_c}°C)` : "no method group",
        ].join(" · "),
      });
    });
    push("CCB", `CCB-${bi + 1}`, true, { why: `Continuing calibration blank after block ${bi + 1}` });
    push("CCV", `CCV-${bi + 1}`, true, { level: "3", why: `Continuing calibration verification after block ${bi + 1}` });
  });
  return rows;
}

export interface OptimizerInput {
  samples: OptimizerSample[];
  methodGroups: OptimizerMethodGroup[];
  trayPositions: OptimizerTrayPosition[];       // in preferred pack order
}

/**
 * Two samples can share a run only if they'll actually run under the same
 * instrument method — so the merge key is the method group's real
 * (acquisition, processing) method pair, not the group's id. Groups with no
 * acquisition/processing method configured don't get merged with each other
 * (there's nothing to prove they're compatible), and samples with no
 * resolvable group stay isolated as before.
 */
function methodKeyFor(gid: string | null, groupById: Map<string, OptimizerMethodGroup>): string {
  if (!gid) return "__nogroup__";
  const g = groupById.get(gid);
  if (!g) return `__unresolved_${gid}__`;
  const acq = g.default_acquisition_method ?? "";
  const proc = g.default_processing_method ?? "";
  if (!acq && !proc) return `__nomethod_${gid}__`;
  return `method::${acq}::${proc}`;
}

export function optimize(input: OptimizerInput): OptimizedSequence[] {
  const { samples, methodGroups, trayPositions } = input;
  const groupById = new Map(methodGroups.map((g) => [g.id, g]));

  // Homogeneity-first strategy: bucket samples by (instrument method,
  // compound) so every batch shares an acquisition method AND analyte.
  // Within each bucket, order by ascending concentration (least → greatest)
  // to minimize carryover. Method buckets are only split when a compound
  // spans more than MAX_SAMPLES_PER_SEQ; different compounds — even from
  // different method_group_id records — may share a run whenever their
  // groups resolve to the same real acquisition+processing method, since
  // that's what actually determines run compatibility on the instrument.
  type Bucket = { key: string; methodKey: string; primaryGroupId: string | null; compound: string | null; samples: OptimizerSample[] };
  const buckets = new Map<string, Bucket>();
  for (const s of samples) {
    const methodKey = methodKeyFor(s.method_group_id, groupById);
    const cmp = s.compound ?? "__nocompound__";
    const key = `${methodKey}::${cmp}`;
    let b = buckets.get(key);
    if (!b) {
      b = { key, methodKey, primaryGroupId: s.method_group_id ?? null, compound: s.compound ?? null, samples: [] };
      buckets.set(key, b);
    }
    b.samples.push(s);
  }
  // Buckets are already one per compound (see the bucket key above), so
  // "group by compound" is structural. Within a compound: Syx ID order
  // (numeric-aware, so -02 sorts before -10), concentration only as a
  // tie-break for the rare case two rows share an ID.
  for (const b of buckets.values()) {
    b.samples.sort((a, z) => {
      const byId = a.batch_id.localeCompare(z.batch_id, undefined, { numeric: true, sensitivity: "base" });
      if (byId !== 0) return byId;
      return parseConcentrationMgPerMl(a.concentration) - parseConcentrationMgPerMl(z.concentration);
    });
  }

  // Order buckets: by method-group priority/temperature, then compound name.
  const orderedBuckets = [...buckets.values()].sort((a, b) => {
    const ga = a.primaryGroupId ? groupById.get(a.primaryGroupId) : null;
    const gb = b.primaryGroupId ? groupById.get(b.primaryGroupId) : null;
    const pa = ga?.priority ?? 999;
    const pb = gb?.priority ?? 999;
    if (pa !== pb) return pa - pb;
    const ta = ga?.temperature_c ?? 0;
    const tb = gb?.temperature_c ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.compound ?? "\uFFFF").localeCompare(b.compound ?? "\uFFFF");
  });

  // Pack buckets into runs. A run holds up to MAX_SAMPLES_PER_SEQ samples and
  // never mixes method groups. Compounds that overflow a run get their own
  // dedicated chunked runs (still ascending concentration).
  const runs: { samples: OptimizerSample[]; primaryGroupId: string | null; temp: number | null; note: string }[] = [];
  let current: { samples: OptimizerSample[]; methodKey: string; primaryGroupId: string | null; temp: number | null; compounds: string[] } | null = null;
  const flush = () => {
    if (!current || current.samples.length === 0) return;
    const g = current.primaryGroupId ? groupById.get(current.primaryGroupId) : null;
    const note = current.compounds.length === 1
      ? `${current.compounds[0]}${g ? ` · ${g.name}` : ""}`
      : `${g?.name ?? "Mixed"} (${current.compounds.join(", ")})`;
    runs.push({
      samples: current.samples,
      primaryGroupId: current.primaryGroupId,
      temp: g?.temperature_c ?? null,
      note,
    });
    current = null;
  };

  for (const b of orderedBuckets) {
    const label = b.compound ?? "Unassigned";
    if (b.samples.length >= MAX_SAMPLES_PER_SEQ) {
      flush();
      const g = b.primaryGroupId ? groupById.get(b.primaryGroupId) : null;
      chunk(b.samples, MAX_SAMPLES_PER_SEQ).forEach((c, i, arr) => {
        runs.push({
          samples: c,
          primaryGroupId: b.primaryGroupId,
          temp: g?.temperature_c ?? null,
          note: arr.length > 1 ? `${label} (part ${i + 1}/${arr.length})${g ? ` · ${g.name}` : ""}` : `${label}${g ? ` · ${g.name}` : ""}`,
        });
      });
      continue;
    }
    // Start a new run when the instrument method changes or the current one would overflow.
    if (!current || current.methodKey !== b.methodKey ||
        current.samples.length + b.samples.length > MAX_SAMPLES_PER_SEQ) {
      flush();
      current = { samples: [], methodKey: b.methodKey, primaryGroupId: b.primaryGroupId, temp: null, compounds: [] };
    }
    current.samples.push(...b.samples);
    current.compounds.push(label);
  }
  flush();

  // Vial allocator — D1 is reserved for QC (standards/blanks), D2+ for
  // samples, never the reverse. Positions that aren't valid tray locations
  // (e.g. the legacy "Ref-N" reference vials) are ignored — QC now draws
  // from the real 108-position QC drawer instead. Locations are sorted into
  // canonical row-major order (per-tray: A1, B1, C1, D1, E1, F1, A2, ...)
  // rather than trusting whatever order the caller's query happened to
  // return, since that's the one thing this module must get right.
  const parsed = trayPositions
    .map((p) => ({ code: p.position_code, loc: tryParseVialLocation(p.position_code) }))
    .filter((p): p is { code: string; loc: VialLocation } => p.loc !== null);
  const trayOrder = { F: 0, B: 1 } as const;
  parsed.sort((a, z) => {
    if (a.loc.drawer !== z.loc.drawer) return a.loc.drawer - z.loc.drawer;
    if (a.loc.tray !== z.loc.tray) return trayOrder[a.loc.tray] - trayOrder[z.loc.tray];
    if (a.loc.row !== z.loc.row) return a.loc.row - z.loc.row;
    return a.loc.column.localeCompare(z.loc.column);
  });
  const qcVials = parsed.filter((p) => isQcLocation(p.loc)).map((p) => p.code);
  const sampleVials = parsed.filter((p) => !isQcLocation(p.loc)).map((p) => p.code);
  let qcIdx = 0, sampleIdx = 0;
  const vialFor = (kind: "qc" | "sample"): string | null => {
    if (kind === "qc") return qcVials[qcIdx++] ?? null;
    return sampleVials[sampleIdx++] ?? null;
  };

  return runs.map((r, i) => {
    const runGroup = r.primaryGroupId ? groupById.get(r.primaryGroupId) ?? null : null;
    const rows = withQC(r.samples, groupById, vialFor, runGroup);
    return {
      index: i + 1,
      name: `Sequence ${i + 1} — ${r.note}`,
      primary_group_id: r.primaryGroupId,
      temperature_c: r.temp,
      rows,
    };
  });
}
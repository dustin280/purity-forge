/**
 * Pure optimizer for the Run List Generator. No I/O; feed it samples,
 * method groups, and available tray positions — get back QC-interleaved
 * sequences with vial assignments and a short "why" trace.
 */

export interface OptimizerSample {
  id: string;
  batch_id: string;
  compound: string | null;
  method_group_id: string | null;
  lot: string | null;
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
  is_ref_vial: boolean;
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
  why: string;                   // rationale for review UI
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

/** Build the fixed QC pattern around up to 30 samples. */
function withQC(
  samples: OptimizerSample[],
  groupById: Map<string, OptimizerMethodGroup>,
  vialFor: (kind: "ref" | "sample") => string | null,
): SequenceRow[] {
  const rows: SequenceRow[] = [];
  const push = (type: SequenceRowType, label: string, isRef: boolean, extra?: Partial<SequenceRow>) => {
    rows.push({
      type, label, sample_id: null,
      lot: null,
      method_group_id: null, method_group_name: null,
      acquisition_method: null, processing_method: null,
      vial: vialFor(isRef ? "ref" : "sample"),
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
      rows.push({
        type: "Sample",
        label: s.batch_id + (s.compound ? ` — ${s.compound}` : "") + lotSuffix,
        sample_id: s.id,
        lot: s.lot ?? null,
        method_group_id: g?.id ?? null,
        method_group_name: g?.name ?? null,
        acquisition_method: g?.default_acquisition_method ?? null,
        processing_method: g?.default_processing_method ?? null,
        vial: vialFor("sample"),
        why: g ? `Method group: ${g.name} (priority ${g.priority}, ${g.temperature_c}°C)` : "No method group assigned",
      });
    });
    push("CCB", `CCB-${bi + 1}`, true, { why: `Continuing calibration blank after block ${bi + 1}` });
    push("CCV", `CCV-${bi + 1}`, true, { why: `Continuing calibration verification after block ${bi + 1}` });
  });
  return rows;
}

/** Sort a Polar/Early + General mixed batch so all polar/early come first. */
function orderPolarThenGeneral(
  samples: OptimizerSample[],
  groupById: Map<string, OptimizerMethodGroup>,
): OptimizerSample[] {
  return [...samples].sort((a, b) => {
    const pa = a.method_group_id ? groupById.get(a.method_group_id)?.priority ?? 999 : 999;
    const pb = b.method_group_id ? groupById.get(b.method_group_id)?.priority ?? 999 : 999;
    return pa - pb;
  });
}

export interface OptimizerInput {
  samples: OptimizerSample[];
  methodGroups: OptimizerMethodGroup[];
  trayPositions: OptimizerTrayPosition[];       // in preferred pack order
}

export function optimize(input: OptimizerInput): OptimizedSequence[] {
  const { samples, methodGroups, trayPositions } = input;
  const groupById = new Map(methodGroups.map((g) => [g.id, g]));

  // Bucket samples by group id (or null bucket)
  const bucket = new Map<string | null, OptimizerSample[]>();
  for (const s of samples) {
    const k = s.method_group_id ?? null;
    const arr = bucket.get(k) ?? [];
    arr.push(s); bucket.set(k, arr);
  }

  // Group order: by priority ASC then temperature ASC
  const orderedGroups = [...methodGroups]
    .filter((g) => (bucket.get(g.id)?.length ?? 0) > 0)
    .sort((a, b) => a.priority - b.priority || a.temperature_c - b.temperature_c);

  const groupNames = new Set(orderedGroups.map((g) => g.name.toLowerCase()));
  const hasPolar = groupNames.has("polar/early");
  const hasGeneral = groupNames.has("general");

  // Assemble sample groups into "runs" — a run is up to 30 samples that get one QC-wrapped sequence.
  const runs: { samples: OptimizerSample[]; primaryGroupId: string | null; temp: number | null; note: string }[] = [];

  // Optional Polar+General merge when both present and it saves a run
  if (hasPolar && hasGeneral) {
    const polar = bucket.get(orderedGroups.find((g) => g.name.toLowerCase() === "polar/early")!.id) ?? [];
    const general = bucket.get(orderedGroups.find((g) => g.name.toLowerCase() === "general")!.id) ?? [];
    const merged = orderPolarThenGeneral([...polar, ...general], groupById);
    const solo = Math.ceil(polar.length / MAX_SAMPLES_PER_SEQ) + Math.ceil(general.length / MAX_SAMPLES_PER_SEQ);
    const mergedCount = Math.ceil(merged.length / MAX_SAMPLES_PER_SEQ);
    if (mergedCount < solo) {
      chunk(merged, MAX_SAMPLES_PER_SEQ).forEach((c) =>
        runs.push({ samples: c, primaryGroupId: null, temp: 40, note: "Polar/Early + General merged" }));
      bucket.delete(orderedGroups.find((g) => g.name.toLowerCase() === "polar/early")!.id);
      bucket.delete(orderedGroups.find((g) => g.name.toLowerCase() === "general")!.id);
    }
  }

  // Remaining groups (also handles null bucket)
  for (const g of orderedGroups) {
    const s = bucket.get(g.id);
    if (!s?.length) continue;
    chunk(s, MAX_SAMPLES_PER_SEQ).forEach((c) =>
      runs.push({ samples: c, primaryGroupId: g.id, temp: g.temperature_c, note: g.name }));
  }
  const unassigned = bucket.get(null) ?? [];
  if (unassigned.length) {
    chunk(unassigned, MAX_SAMPLES_PER_SEQ).forEach((c) =>
      runs.push({ samples: c, primaryGroupId: null, temp: null, note: "No method group" }));
  }

  // Reorder so Hydrophobes/GLP never sit immediately before a Polar/Early run.
  // Rule of thumb: hard-sort by (priority, temperature) — since Polar/Early is
  // priority 1 and Hydrophobes/GLP are 3/4, sorting the run list ascending
  // guarantees the constraint.
  runs.sort((a, b) => {
    const ap = a.primaryGroupId ? groupById.get(a.primaryGroupId)?.priority ?? 999 : 0;
    const bp = b.primaryGroupId ? groupById.get(b.primaryGroupId)?.priority ?? 999 : 0;
    if (ap !== bp) return ap - bp;
    return (a.temp ?? 0) - (b.temp ?? 0);
  });

  // Vial allocator — walk tray positions in order
  const refVials = trayPositions.filter((p) => p.is_ref_vial).map((p) => p.position_code);
  const sampleVials = trayPositions.filter((p) => !p.is_ref_vial).map((p) => p.position_code);
  let refIdx = 0, sampleIdx = 0;
  const vialFor = (kind: "ref" | "sample"): string | null => {
    if (kind === "ref") return refVials[refIdx++ % Math.max(refVials.length, 1)] ?? null;
    const v = sampleVials[sampleIdx] ?? null;
    sampleIdx++;
    return v;
  };

  return runs.map((r, i) => {
    const rows = withQC(r.samples, groupById, vialFor);
    return {
      index: i + 1,
      name: `Sequence ${i + 1} — ${r.note}`,
      primary_group_id: r.primaryGroupId,
      temperature_c: r.temp,
      rows,
    };
  });
}
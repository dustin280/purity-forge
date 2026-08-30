/**
 * Calibration / QC peak monitor.
 *
 * The governing constraint, from Dustin 2026-08-29: **peak metrics from
 * different acquisition methods are not comparable.** A compound may have
 * several calibration sets run under different methods, and many runs have
 * missing or incomplete processing. Pooling those would produce a tidy trend
 * line built from unrelated measurements — worse than no monitor at all,
 * because it looks authoritative.
 *
 * So the unit of analysis here is not a compound. It is a
 * (compound × acquisition method) pair, with processing method as a second
 * split. Nothing in this file aggregates across acquisition methods, and a
 * reading whose method is unknown is reported separately rather than merged
 * into the nearest group.
 *
 * What it answers, per group:
 *   - does the observed peak height sit inside the usable detector window?
 *   - is the response factor flat across levels, or drifting?
 *   - does the stored calibration range agree with what the instrument did?
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Usable peak-height window for a 6-level curve on this DAD, in mAU. */
export const HEIGHT_FLOOR_MAU = 100;
export const HEIGHT_CEILING_MAU = 1800;
/** Response-factor spread above this suggests the curve isn't linear. */
export const RF_RSD_WARN_PCT = 10;
/** USP-ish symmetry bounds; outside this the integration wants a look. */
export const SYMMETRY_MIN = 0.8;
export const SYMMETRY_MAX = 1.5;

export interface MonitorLevel {
  calibrationAmount: number | null;
  readings: number;
  meanHeight: number | null;
  meanArea: number | null;
  meanResponseFactor: number | null;
  meanSymmetry: number | null;
  lastReadingAt: string | null;
  flags: string[];
}

export interface MonitorGroup {
  compoundId: string | null;
  compoundName: string;
  /** The hard partition. null means the source didn't record one. */
  acqMethodName: string | null;
  processingMethodNames: string[];
  processingStates: string[];
  sampleType: string;
  readings: number;
  levels: MonitorLevel[];
  /** Stored range on the compound, for comparison against observed heights. */
  storedCalMin: number | null;
  storedCalMax: number | null;
  rfRsdPct: number | null;
  flags: string[];
  firstReadingAt: string | null;
  lastReadingAt: string | null;
}

export interface CalQcMonitorResult {
  groups: MonitorGroup[];
  totalReadings: number;
  /** Distinct acquisition methods seen — how fragmented the evidence is. */
  acqMethodCount: number;
  readingsWithoutMethod: number;
  generatedAt: string;
}

type Row = {
  compound_id: string | null;
  raw_compound_name: string;
  sample_type: string;
  calibration_amount: number | string | null;
  height_mau: number | string | null;
  area: number | string | null;
  response_factor: number | string | null;
  symmetry: number | string | null;
  acq_method_name: string | null;
  processing_method_name: string | null;
  processing_state: string | null;
  reading_at: string;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function rsdPct(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  if (m === 0) return null;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return (Math.sqrt(variance) / Math.abs(m)) * 100;
}

export const getCalQcMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalQcMonitorResult> => {
    const { data, error } = await context.supabase
      .from("cal_qc_peak_log")
      .select("compound_id, raw_compound_name, sample_type, calibration_amount, height_mau, area, response_factor, symmetry, acq_method_name, processing_method_name, processing_state, reading_at")
      .order("reading_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const { data: compounds } = await context.supabase
      .from("compounds")
      .select("id, name, cal_l1_mg_per_ml, cal_l2_mg_per_ml, cal_l3_mg_per_ml, cal_l4_mg_per_ml, cal_l5_mg_per_ml, cal_l6_mg_per_ml");
    const storedRange = new Map<string, { min: number | null; max: number | null }>();
    for (const c of compounds ?? []) {
      const levels = [c.cal_l1_mg_per_ml, c.cal_l2_mg_per_ml, c.cal_l3_mg_per_ml,
                      c.cal_l4_mg_per_ml, c.cal_l5_mg_per_ml, c.cal_l6_mg_per_ml]
        .map((v) => num(v as number | null))
        .filter((v): v is number => v != null);
      storedRange.set(c.id, {
        min: levels.length ? Math.min(...levels) : null,
        max: levels.length ? Math.max(...levels) : null,
      });
    }

    // Partition key includes the acquisition method, always.
    const byGroup = new Map<string, Row[]>();
    for (const r of rows) {
      const key = [r.compound_id ?? `raw:${r.raw_compound_name}`, r.acq_method_name ?? "", r.sample_type].join("||");
      const list = byGroup.get(key) ?? [];
      list.push(r);
      byGroup.set(key, list);
    }

    const groups: MonitorGroup[] = [];
    for (const list of byGroup.values()) {
      const head = list[0];
      const stored = head.compound_id ? storedRange.get(head.compound_id) : undefined;

      const byLevel = new Map<string, Row[]>();
      for (const r of list) {
        const k = String(num(r.calibration_amount) ?? "unassigned");
        const l = byLevel.get(k) ?? [];
        l.push(r);
        byLevel.set(k, l);
      }

      const levels: MonitorLevel[] = [...byLevel.entries()]
        .map(([, rs]) => {
          const heights = rs.map((r) => num(r.height_mau)).filter((v): v is number => v != null);
          const areas = rs.map((r) => num(r.area)).filter((v): v is number => v != null);
          const rfs = rs.map((r) => num(r.response_factor)).filter((v): v is number => v != null);
          const syms = rs.map((r) => num(r.symmetry)).filter((v): v is number => v != null);
          const mh = mean(heights);
          const ms = mean(syms);
          const flags: string[] = [];
          if (mh != null && mh < HEIGHT_FLOOR_MAU) flags.push(`height ${mh.toFixed(0)} mAU is under the ${HEIGHT_FLOOR_MAU} mAU floor`);
          if (mh != null && mh > HEIGHT_CEILING_MAU) flags.push(`height ${mh.toFixed(0)} mAU is over the ${HEIGHT_CEILING_MAU} mAU ceiling`);
          if (ms != null && (ms < SYMMETRY_MIN || ms > SYMMETRY_MAX)) flags.push(`symmetry ${ms.toFixed(2)} is outside ${SYMMETRY_MIN}–${SYMMETRY_MAX}`);
          return {
            calibrationAmount: num(rs[0].calibration_amount),
            readings: rs.length,
            meanHeight: mh,
            meanArea: mean(areas),
            meanResponseFactor: mean(rfs),
            meanSymmetry: ms,
            lastReadingAt: rs.map((r) => r.reading_at).sort().at(-1) ?? null,
            flags,
          };
        })
        .sort((a, b) => (a.calibrationAmount ?? 0) - (b.calibrationAmount ?? 0));

      // RF spread across LEVELS within this one method — the linearity signal.
      const levelRfs = levels.map((l) => l.meanResponseFactor).filter((v): v is number => v != null);
      const rfRsd = rsdPct(levelRfs);

      const flags: string[] = [];
      if (!head.acq_method_name) flags.push("no acquisition method recorded — these readings can't be compared with anything else");
      const states = [...new Set(list.map((r) => r.processing_state).filter((v): v is string => !!v))];
      if (states.some((s) => !/^passed$/i.test(s))) flags.push(`processing state: ${states.join(", ")}`);
      if (rfRsd != null && rfRsd > RF_RSD_WARN_PCT) flags.push(`response factor varies ${rfRsd.toFixed(1)}% across levels — check linearity`);
      const observedLevels = levels.map((l) => l.calibrationAmount).filter((v): v is number => v != null);
      if (stored?.min != null && observedLevels.length) {
        const obsMin = Math.min(...observedLevels);
        const obsMax = Math.max(...observedLevels);
        if (Math.abs(obsMin - stored.min) > 1e-9 || (stored.max != null && Math.abs(obsMax - stored.max) > 1e-9)) {
          flags.push(`run levels ${obsMin}–${obsMax} mg/mL differ from the stored range ${stored.min}–${stored.max}`);
        }
      }

      const times = list.map((r) => r.reading_at).sort();
      groups.push({
        compoundId: head.compound_id,
        compoundName: head.raw_compound_name,
        acqMethodName: head.acq_method_name,
        processingMethodNames: [...new Set(list.map((r) => r.processing_method_name).filter((v): v is string => !!v))],
        processingStates: states,
        sampleType: head.sample_type,
        readings: list.length,
        levels,
        storedCalMin: stored?.min ?? null,
        storedCalMax: stored?.max ?? null,
        rfRsdPct: rfRsd,
        flags,
        firstReadingAt: times[0] ?? null,
        lastReadingAt: times.at(-1) ?? null,
      });
    }

    groups.sort((a, b) =>
      a.compoundName.localeCompare(b.compoundName)
      || String(a.acqMethodName ?? "").localeCompare(String(b.acqMethodName ?? "")));

    return {
      groups,
      totalReadings: rows.length,
      acqMethodCount: new Set(rows.map((r) => r.acq_method_name).filter(Boolean)).size,
      readingsWithoutMethod: rows.filter((r) => !r.acq_method_name).length,
      generatedAt: new Date().toISOString(),
    };
  });

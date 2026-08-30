/**
 * Worklists for the Non-HPLC Analysis Results area: one per non-purity test
 * type, listing exactly the samples flagged for that test so an analyst can
 * pick from a short list instead of hunting through Samples.
 *
 * "Flagged for a test" means a `tests` row of that type exists — that's what
 * Sample Receipt provisions from the requested test parameters, and it's the
 * only source that covers both the three-level vial ids and the older flat
 * ones (`samples.assigned_test_type` is null on everything pre-hierarchy).
 *
 * Result entry itself stays in nonchrom-results.functions.ts; this file only
 * answers "what is waiting" and carries sterility's interim observations.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const NON_PURITY = ["sterility", "endotoxin", "heavy_metals"] as const;
export type NonPurityTestType = (typeof NON_PURITY)[number];

export interface SterilityObservation {
  checkpoint: "day3" | "day7";
  status: "clear" | "turbid";
  notes: string | null;
  observed_at: string;
  observed_by_name: string | null;
}

export interface NonchromWorklistRow {
  test_id: string;
  sample_id: string;
  batch_id: string;
  compound: string | null;
  client: string | null;
  lot: string | null;
  receipt_date: string | null;
  due_date: string | null;
  status: string;
  /** Set once a result has been entered; the row then reads as done. */
  result_id: string | null;
  result_entered_at: string | null;
  result_summary: string | null;
  /** Sterility only. Empty for the other two types. */
  observations: SterilityObservation[];
  /** Days since the vial went into the incubator, when known. */
  incubation_day: number | null;
}

/** One-line summary of a saved result, so the list can show it without a click. */
function summarize(
  testType: NonPurityTestType,
  data: Record<string, unknown> | null,
): string | null {
  if (!data) return null;
  if (testType === "sterility") {
    return `${String(data.verdict ?? "—").toUpperCase()} — FTM ${data.ftm_result}, TSB ${data.tsb_result}`;
  }
  if (testType === "endotoxin") {
    const reading =
      data.result_value != null
        ? ` (${data.result_comparator ?? ""}${data.result_value} ${data.unit ?? ""})`
        : "";
    return `${String(data.verdict ?? "—").toUpperCase()}${reading}`;
  }
  return String(data.verdict ?? "—").toUpperCase();
}

export const listNonchromWorklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ test_type: z.enum(NON_PURITY) }).parse(d))
  .handler(async ({ context, data }): Promise<NonchromWorklistRow[]> => {
    const supabase = (context as { supabase: SB }).supabase;

    const { data: tests, error: tErr } = await supabase
      .from("tests")
      .select("id, sample_id, test_type, status")
      .eq("test_type", data.test_type);
    if (tErr) throw tErr;
    if (!tests?.length) return [];

    const testIds = tests.map((t: { id: string }) => t.id);
    const sampleIds = [...new Set(tests.map((t: { sample_id: string }) => t.sample_id))];

    const [{ data: samples }, { data: results }, { data: obs }, { data: slots }] =
      await Promise.all([
        supabase
          .from("samples")
          .select("id, batch_id, compound, client, lot, receipt_date, due_date, status")
          .in("id", sampleIds),
        supabase
          .from("nonchrom_results")
          .select("id, test_id, data, analysis_date")
          .in("test_id", testIds),
        data.test_type === "sterility"
          ? supabase
              .from("sterility_observations")
              .select("test_id, checkpoint, status, notes, observed_at, observed_by")
              .in("test_id", testIds)
          : Promise.resolve({ data: [] }),
        // Incubator placement is recorded in sample_locations with the TEST id
        // carried in `notes` -- odd, but it's the existing convention that
        // placeSampleInIncubator/getTestIncubatorLocation already use.
        supabase
          .from("sample_locations")
          .select("notes, assigned_at, status, location_type")
          .eq("location_type", "incubator")
          .eq("status", "active")
          .in("notes", testIds),
      ]);

    // Resolve observer names in one go rather than per row.
    const observerIds = [
      ...new Set(
        (obs ?? []).map((o: { observed_by: string | null }) => o.observed_by).filter(Boolean),
      ),
    ];
    let nameById = new Map<string, string>();
    if (observerIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", observerIds);
      nameById = new Map(
        (profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]),
      );
    }

    const sampleById = new Map((samples ?? []).map((s: { id: string }) => [s.id, s]));
    const resultByTest = new Map((results ?? []).map((r: { test_id: string }) => [r.test_id, r]));
    const obsByTest = new Map<string, SterilityObservation[]>();
    for (const o of obs ?? []) {
      const list = obsByTest.get(o.test_id) ?? [];
      list.push({
        checkpoint: o.checkpoint,
        status: o.status,
        notes: o.notes,
        observed_at: o.observed_at,
        observed_by_name: o.observed_by ? (nameById.get(o.observed_by) ?? null) : null,
      });
      obsByTest.set(o.test_id, list);
    }
    // Earliest still-active incubator placement is when incubation started.
    const startedByTest = new Map<string, string>();
    for (const s of slots ?? []) {
      const prev = startedByTest.get(s.notes);
      if (!prev || s.assigned_at < prev) startedByTest.set(s.notes, s.assigned_at);
    }

    const rows: NonchromWorklistRow[] = [];
    for (const t of tests) {
      const s = sampleById.get(t.sample_id) as Record<string, string | null> | undefined;
      if (!s) continue;
      const r = resultByTest.get(t.id) as
        | { id: string; data: Record<string, unknown>; analysis_date: string }
        | undefined;
      const started = startedByTest.get(t.id);
      rows.push({
        test_id: t.id,
        sample_id: t.sample_id,
        batch_id: (s.batch_id as string) ?? "—",
        compound: s.compound ?? null,
        client: s.client ?? null,
        lot: s.lot ?? null,
        receipt_date: s.receipt_date ?? null,
        due_date: s.due_date ?? null,
        status: (s.status as string) ?? "",
        result_id: r?.id ?? null,
        result_entered_at: r?.analysis_date ?? null,
        result_summary: r ? summarize(data.test_type, r.data) : null,
        observations: (obsByTest.get(t.id) ?? []).sort((a, b) =>
          a.checkpoint.localeCompare(b.checkpoint),
        ),
        incubation_day: started
          ? Math.floor((Date.now() - new Date(started).getTime()) / 86_400_000)
          : null,
      });
    }
    // Outstanding work first, then oldest by due date -- the analyst's
    // question is "what still needs reading", not "what happened recently".
    rows.sort((a, b) => {
      if (!a.result_id !== !b.result_id) return a.result_id ? 1 : -1;
      return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    });
    return rows;
  });

/**
 * Records a day-3 or day-7 look. Upserts on (test_id, checkpoint): re-reading
 * the same checkpoint corrects it rather than stacking a second row, so
 * "what did we see on day 3" always has one answer.
 */
export const recordSterilityObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        testId: z.string().uuid(),
        checkpoint: z.enum(["day3", "day7"]),
        status: z.enum(["clear", "turbid"]),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("sterility_observations")
      .upsert(
        {
          test_id: data.testId,
          checkpoint: data.checkpoint,
          status: data.status,
          notes: data.notes ?? null,
          observed_at: now,
          observed_by: userId,
          updated_at: now,
        },
        { onConflict: "test_id,checkpoint" },
      )
      .select()
      .single();
    if (error) throw error;
    return row;
  });

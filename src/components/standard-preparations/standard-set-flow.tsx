import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCompounds } from "@/lib/compounds.functions";
import {
  createStandardSet,
  getStandardSet,
} from "@/lib/standard-preparations/standard-set.functions";
import { generateStandardSetCutSheetPdf } from "@/lib/standard-preparations/cutsheet-pdf";
import {
  MULTI_COMPOUND_STANDARDS,
  POLAR_UNGROUPED,
  RUN_ALONE,
  MIN_RT_GAP_MIN,
  standardSpread,
  resolveMember,
  type MultiCompoundStandard,
} from "@/lib/standard-preparations/multi-compound-standards";
import {
  planCompoundStocks,
  primaryLabel,
  type CompoundPlan,
  type LevelDraw,
} from "@/lib/standard-preparations/intermediate-stocks";
import { benchGrid, snapLadder, worstShift } from "@/lib/standard-preparations/level-grid";
import { getPrepSettings } from "@/lib/sample-prep/master-data.functions";
import { qk } from "@/lib/query-keys";
import { useWorkflowSignal } from "@/contexts/workflow-guide-context";

interface GridCompound {
  compoundId: string;
  name: string;
  abbrev: string;
  stockConcMgPerMl: number;
}
interface GridLevel {
  label: string;
  conc: Record<string, number | null>; // keyed by compoundId
}

/**
 * Fallback pipette floor, used only until sp_settings loads. The live value
 * is 50 µL; anything a level can't reach from the primary stock is served by
 * an intermediate rather than refused (see intermediate-stocks.ts).
 */
const FALLBACK_MIN_PIPETTE_UL = 50;

/**
 * Primary strength a multi-compound standard is made from.
 *
 * Not a preference: the sum of a level's concentrations is exactly the
 * primary strength needed to fit it in the vial, and Standard 1 sums to
 * 3.69 mg/mL at L6. A bigger batch does not help -- required stock and batch
 * scale together. 4.10 is the bare minimum at a 90% fill; 5 leaves margin
 * for a level revised upward, which is the only direction they move.
 */
const MULTI_COMPOUND_STOCK_MG_PER_ML = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function defaultAbbrev(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "");
  return compact.slice(0, 3).toUpperCase() || "C";
}

/**
 * Grid entry matching how every standard set was actually designed tonight
 * by hand: rows = levels, columns = compounds, cell = concentration. Stock
 * and diluent volumes compute live from batch volume + each compound's
 * stock strength -- the same math used for SUMMIT/TESA-IPA/CJC-IPA.
 */
export function StandardSetFlow({
  defaultAnalystName,
  userToken,
}: {
  defaultAnalystName: string;
  userToken: string;
}) {
  const navigate = useNavigate();
  const listCompoundsFn = useServerFn(listCompounds);
  const createFn = useServerFn(createStandardSet);
  const getSetFn = useServerFn(getStandardSet);
  const { data: allCompounds = [], isPending: compoundsLoading } = useQuery({
    queryKey: qk.compounds.list(),
    queryFn: () => listCompoundsFn(),
  });
  const settingsQ = useQuery({ queryKey: ["sp-settings"], queryFn: () => getPrepSettings() });
  const signalWorkflowEvent = useWorkflowSignal();

  const [standardName, setStandardName] = useState("");
  const [analystName, setAnalystName] = useState(defaultAnalystName);
  const [diluentName, setDiluentName] = useState("Mobile Phase A");
  const [batchVolumeMl, setBatchVolumeMl] = useState("1");
  const [rangeReasoning, setRangeReasoning] = useState("");

  const [compounds, setCompounds] = useState<GridCompound[]>([]);
  const [levels, setLevels] = useState<GridLevel[]>(
    Array.from({ length: 6 }, (_, i) => ({ label: `L${i + 1}`, conc: {} })),
  );

  const availableToAdd = allCompounds.filter(
    (c) => !compounds.some((gc) => gc.compoundId === c.id),
  );

  /**
   * Adding a compound seeds its column from the compound's own recommended
   * calibration range instead of six empty cells. Those levels are derived
   * from measured peak height (100-1800 mAU) and are already a whole 5 uL of
   * 1 mg/mL stock each, so the common case becomes "check and submit" rather
   * than "type 6 numbers per compound and hope they're the right ones".
   * Everything stays editable -- this is a starting point, not a lock.
   */
  function recommendedLevels(c: { [k: string]: unknown }): Array<number | null> {
    return [1, 2, 3, 4, 5, 6].map((n) => {
      const v = c[`cal_l${n}_mg_per_ml`];
      const num = typeof v === "number" ? v : v == null ? NaN : Number(v);
      return Number.isFinite(num) ? num : null;
    });
  }

  function addCompound(id: string) {
    const c = allCompounds.find((x) => x.id === id);
    if (!c) return;
    setCompounds((prev) => [
      ...prev,
      {
        compoundId: c.id,
        name: c.name,
        abbrev: defaultAbbrev(c.name),
        stockConcMgPerMl: 1,
      },
    ]);
    const rec = recommendedLevels(c as unknown as { [k: string]: unknown });
    if (rec.some((v) => v != null)) {
      setLevels((prev) =>
        prev.map((l, i) => (rec[i] == null ? l : { ...l, conc: { ...l.conc, [c.id]: rec[i] } })),
      );
    }
  }
  /**
   * Loads a recommended grouping in one go: the compounds, their published
   * abbreviations (Melanotan MT-I and MT-II share a standard and would both
   * default to "MEL"), and each one's own calibration levels. Replaces the
   * grid rather than appending -- the recommendations are only offered while
   * it's empty, and a half-merged standard isn't a thing anyone wants.
   */
  function applyPreset(std: MultiCompoundStandard) {
    const resolved = std.members
      .map((m) => ({ m, c: resolveMember(m, allCompounds) }))
      .flatMap(({ m, c }) => (c ? [{ m, c }] : []));
    if (!resolved.length) {
      toast.error(`None of ${std.name}'s compounds are in the library yet.`);
      return;
    }
    // 1 mg/mL cannot make these. The sum of a standard's level
    // concentrations IS the primary strength it needs -- at L6 that is 1.9
    // to 3.7 mg/mL across the six recommended standards -- and no batch
    // volume changes it, since required stock and batch scale together.
    // 5 clears every one of them with room for a level revised upward.
    setCompounds(
      resolved.map(({ m, c }) => ({
        compoundId: c.id,
        name: c.name,
        abbrev: m.abbrev,
        stockConcMgPerMl: MULTI_COMPOUND_STOCK_MG_PER_ML,
      })),
    );
    setLevels((prev) =>
      prev.map((level, i) => {
        const conc: Record<string, number | null> = {};
        for (const { c } of resolved) {
          const rec = recommendedLevels(c as unknown as { [k: string]: unknown })[i];
          if (rec != null) conc[c.id] = rec;
        }
        return { ...level, conc };
      }),
    );
    if (!standardName.trim()) setStandardName(std.name);
    const missing = std.members.length - resolved.length;
    toast.success(
      `Loaded ${std.name} — ${resolved.length} compound${resolved.length === 1 ? "" : "s"}` +
        (missing ? `, ${missing} not in the library` : ""),
    );
  }

  function removeCompound(id: string) {
    setCompounds((prev) => prev.filter((c) => c.compoundId !== id));
    setLevels((prev) =>
      prev.map((l) => {
        const { [id]: _drop, ...rest } = l.conc;
        return { ...l, conc: rest };
      }),
    );
  }
  function addLevel() {
    setLevels((prev) => [...prev, { label: `L${prev.length + 1}`, conc: {} }]);
  }
  function removeLevel(idx: number) {
    setLevels((prev) => prev.filter((_, i) => i !== idx));
  }

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;
  const floorUl = settingsQ.data?.absolute_min_pipette_ul ?? FALLBACK_MIN_PIPETTE_UL;

  /**
   * Per-compound stock plan for the whole set. A low level that the primary
   * stock can't reach at the pipette floor gets an intermediate to draw from
   * rather than an error telling the analyst to go fix the batch volume.
   */
  const plans = useMemo(() => {
    const map = new Map<string, CompoundPlan>();
    for (const c of compounds) {
      map.set(
        c.compoundId,
        planCompoundStocks({
          compoundId: c.compoundId,
          abbrev: c.abbrev,
          stockConcMgPerMl: c.stockConcMgPerMl,
          batchUl,
          floorUl,
          concByLevel: levels.map((l) => l.conc[c.compoundId] ?? null),
        }),
      );
    }
    return map;
  }, [compounds, levels, batchUl, floorUl]);

  function drawFor(levelIdx: number, compoundId: string): LevelDraw | null {
    return plans.get(compoundId)?.draws.get(levelIdx) ?? null;
  }
  function stockUsedUl(levelIdx: number): number {
    return compounds.reduce((sum, c) => sum + (drawFor(levelIdx, c.compoundId)?.volumeUl ?? 0), 0);
  }
  function diluentUl(levelIdx: number): number {
    return Math.max(0, batchUl - stockUsedUl(levelIdx));
  }

  /**
   * What each compound's ladder becomes on the fixed-pipettor grid, and how
   * far it has to move to get there. Null when no strictly increasing
   * assignment exists for that compound.
   */
  const snapPreview = useMemo(() => {
    const map = new Map<string, ReturnType<typeof snapLadder>>();
    for (const c of compounds) {
      const grid = benchGrid(c.stockConcMgPerMl, batchUl, floorUl);
      map.set(
        c.compoundId,
        snapLadder(
          levels.map((l) => l.conc[c.compoundId] ?? null),
          grid,
        ),
      );
    }
    return map;
  }, [compounds, levels, batchUl, floorUl]);

  const snapIsUseful = compounds.some((c) => {
    const s = snapPreview.get(c.compoundId);
    return s != null && s.some((x) => Math.abs(x.shift) > 1e-9);
  });

  /**
   * Rewrites every compound's levels onto the grid. Only the levels that
   * actually exist move; a blank cell stays blank.
   */
  function snapAllToGrid() {
    const next = levels.map((l) => ({ ...l, conc: { ...l.conc } }));
    let moved = 0;
    for (const c of compounds) {
      const snapped = snapPreview.get(c.compoundId);
      if (!snapped) continue;
      let k = 0;
      for (let i = 0; i < next.length; i++) {
        if (next[i].conc[c.compoundId] == null) continue;
        const s = snapped[k++];
        if (!s) break;
        if (Math.abs(s.shift) > 1e-9) moved++;
        next[i].conc[c.compoundId] = Number(s.point.concMgPerMl.toPrecision(6));
      }
    }
    setLevels(next);
    toast.success(
      moved
        ? `Moved ${moved} level${moved === 1 ? "" : "s"} onto the bench grid`
        : "Every level was already on the grid",
    );
  }

  /**
   * How much PRIMARY stock this compound's whole ladder consumes.
   *
   * Dustin, 2026-08-31: "I do not make multiple stocks, I make 1 per 6
   * standard cal set. The stock has to cover all 6 standards made at 1ml
   * each." So the number that matters is not what one level draws, it is
   * what the entire set draws before the stock is thrown away.
   *
   * Two parts, and the second is easy to forget: the levels drawn straight
   * from the primary, plus the aliquot spent MAKING the first intermediate.
   * That aliquot is charged in full -- a single-use stock gets no credit for
   * the intermediate it leaves behind. Deeper decades come off the decade
   * above, so they cost primary only through that first aliquot.
   */
  function primaryNeededUl(compoundId: string): number {
    const plan = plans.get(compoundId);
    if (!plan) return 0;
    let direct = 0;
    for (const d of plan.draws.values()) if (!d.fromFactor) direct += d.volumeUl;
    return direct + (plan.intermediates[0]?.aliquotUl ?? 0);
  }

  /** Rounded up to something you'd actually make, with slack for dead volume. */
  function stockToMakeUl(compoundId: string): number {
    const need = primaryNeededUl(compoundId);
    return need > 0 ? Math.ceil((need * 1.15) / 50) * 50 : 0;
  }

  /** Every intermediate that has to exist before the levels can be made. */
  const allIntermediates = compounds.flatMap((c) =>
    (plans.get(c.compoundId)?.intermediates ?? []).map((it) => ({ compound: c, it })),
  );

  /**
   * Whether a level can actually be made at the bench.
   *
   * diluentUl clamps at zero, so a level demanding more stock than the batch
   * volume used to display a tidy "0 µL diluent" and look finished -- an
   * impossible prep that reads as a valid one. The pipette floor no longer
   * appears here: it's satisfied by construction, since anything below it is
   * drawn from an intermediate. What survives is the case an intermediate
   * cannot fix, where a single aliquot would exceed the whole batch.
   */
  function levelIssues(levelIdx: number): string[] {
    const issues: string[] = [];
    if (!batchUl) return issues;
    const level = levels[levelIdx];
    const anyConc = compounds.some((c) => level.conc[c.compoundId] != null);
    if (!anyConc) return issues;
    const used = stockUsedUl(levelIdx);

    if (used > batchUl + 0.5) {
      // Two different failures wear the same symptom, and they have opposite
      // remedies -- so the advice has to branch on which one this is.
      //
      // Every draw straight from the primary: used is sum(conc/stockConc) *
      // batch and the batch is batch, so both sides scale together and a
      // bigger vessel changes nothing. Only a stronger primary or lower
      // levels can fix it.
      //
      // Any draw coming off an intermediate: that volume is inflated by the
      // intermediate's factor, and the factor exists only because the
      // primary draw fell under the pipette floor. A bigger batch lifts it
      // back over, the intermediate disappears, and the volume can drop by
      // the whole factor. Here a bigger batch is exactly the fix.
      const viaIntermediate = compounds.filter((c) => drawFor(levelIdx, c.compoundId)?.fromFactor);
      if (viaIntermediate.length) {
        issues.push(
          `needs ${Math.round(used)} µL of stock for a ${Math.round(batchUl)} µL batch —` +
            ` ${viaIntermediate.map((c) => c.abbrev).join(", ")} draw${viaIntermediate.length === 1 ? "s" : ""}` +
            ` from an intermediate, which multiplies the volume. Raise the batch volume so they can` +
            ` come straight from the primary.`,
        );
      } else {
        const ratio = compounds.reduce((sum, c) => {
          const v = level.conc[c.compoundId];
          return sum + (v != null && c.stockConcMgPerMl > 0 ? v / c.stockConcMgPerMl : 0);
        }, 0);
        issues.push(
          `needs ${Math.round(used)} µL of stock for a ${Math.round(batchUl)} µL batch` +
            ` — a bigger batch won't help, both scale together. Use primaries at least` +
            ` ${(Math.ceil(ratio * 100) / 100).toFixed(2)}× their current strength, or lower this level.`,
        );
      }
    } else if (used > batchUl * 0.9) {
      issues.push(
        `${Math.round((used / batchUl) * 100)}% of this level is stock — barely a dilution; a stronger primary stock would give more room`,
      );
    }
    for (const c of compounds) {
      const d = drawFor(levelIdx, c.compoundId);
      if (d && !d.ok) {
        issues.push(
          `${c.abbrev} would need ${Math.round(d.volumeUl)} µL of ${d.sourceLabel}, more than the ${Math.round(batchUl)} µL batch — raise the batch volume or use a weaker primary stock`,
        );
      }
    }
    return issues;
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        prepared_at: new Date().toISOString(),
        analyst_name: analystName,
        user_token: userToken,
        standard_name: standardName,
        diluent_name: diluentName,
        batch_volume_ml: Number(batchVolumeMl) || 1,
        range_reasoning: rangeReasoning || null,
        // Made first, in order: a 1:100 is a dilution of the 1:10, so the
        // steps have to be read top to bottom.
        intermediate_steps: allIntermediates.map(({ compound, it }) => ({
          compound_id: compound.compoundId,
          compound_name: compound.name,
          label: it.label,
          source_label: it.sourceLabel,
          factor: it.factor,
          concentration_mg_per_ml: round2(it.concMgPerMl),
          aliquot_ul: round2(it.aliquotUl),
          diluent_ul: round2(it.diluentUl),
          volume_ul: round2(it.volumeUl),
        })),
        levels: levels
          .map((l, i) => ({
            row_no: i + 1,
            label: l.label,
            components: compounds
              .filter((c) => l.conc[c.compoundId] != null)
              .map((c) => {
                const d = drawFor(i, c.compoundId);
                return {
                  compound_id: c.compoundId,
                  compound_name: c.name,
                  abbrev: c.abbrev,
                  concentration_mg_per_ml: l.conc[c.compoundId],
                  stock_volume_ul: d ? round2(d.volumeUl) : null,
                  source_label: d?.sourceLabel ?? primaryLabel(c.abbrev),
                  stock_concentration_mg_per_ml: c.stockConcMgPerMl,
                };
              }),
            diluent_volume_ul: round2(diluentUl(i)),
            expected_note: null,
          }))
          .filter((l) => l.components.length > 0),
      };
      const created = await createFn({ data: payload });
      const detail = await getSetFn({ data: { id: created.id } });
      // The stored label is the bench-facing name; the factor behind it is
      // what restates the dilution relative to the primary. Look it up rather
      // than parsing the label back apart.
      const factorByLabel = new Map(detail.intermediateSteps.map((it) => [it.label, it.factor]));
      const doc = generateStandardSetCutSheetPdf({
        standardName: detail.standard_name,
        logNumber: detail.log_number,
        preparedAt: detail.prepared_at,
        analystName: detail.analyst_name,
        diluentName: detail.final_diluent ?? diluentName,
        batchVolumeMl: detail.final_volume_ml ?? Number(batchVolumeMl),
        levels: detail.levels.map((l) => ({
          label: l.label,
          components: l.components.map((c) => ({
            abbrev:
              compounds.find((gc) => gc.name === c.compound_name)?.abbrev ??
              defaultAbbrev(c.compound_name),
            concMgPerMl: c.concentration_mg_per_ml,
            stockUl: c.stock_volume_ul,
            sourceLabel: c.source_label,
            sourceFactor: c.source_label ? (factorByLabel.get(c.source_label) ?? null) : null,
            stockConcMgPerMl: c.stock_concentration_mg_per_ml,
          })),
          diluentUl: l.diluent_volume_ul,
          expectedNote: l.expected_note,
        })),
        intermediates: detail.intermediateSteps.map((it) => ({
          compoundName: it.compound_name,
          label: it.label,
          sourceLabel: it.source_label,
          concMgPerMl: it.concentration_mg_per_ml,
          aliquotUl: it.aliquot_ul,
          diluentUl: it.diluent_ul,
          volumeUl: it.volume_ul,
        })),
        rangeReasoning: rangeReasoning || "—",
        reviewerName: detail.reviewer_name,
        approvedAt: detail.approved_at,
      });
      doc.save(`${detail.log_number}_cutsheet.pdf`);
      return created;
    },
    onSuccess: (res) => {
      toast.success(`Saved ${res.log_number} — cut sheet downloaded`);
      signalWorkflowEvent("standard-set-created");
      navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    standardName.trim() &&
    compounds.length > 0 &&
    levels.some((l) => compounds.some((c) => l.conc[c.compoundId] != null));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Standard name</Label>
            <Input
              value={standardName}
              onChange={(e) => setStandardName(e.target.value)}
              placeholder="e.g. SUMMIT Calibration Set"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Analyst</Label>
            <Input value={analystName} onChange={(e) => setAnalystName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diluent</Label>
            <Input value={diluentName} onChange={(e) => setDiluentName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Batch volume (mL, per level)</Label>
            <Input
              type="number"
              step="0.1"
              value={batchVolumeMl}
              onChange={(e) => setBatchVolumeMl(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Compounds</div>
          <Select value="" onValueChange={addCompound}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Add a compound…" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.is_blend ? " (blend)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {compounds.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            One stock per compound, made fresh for this set and covering all{" "}
            {levels.filter((l) => compounds.some((c) => l.conc[c.compoundId] != null)).length}{" "}
            levels at {batchVolumeMl} mL each. The figure on each chip includes the aliquot spent
            making its first intermediate — a single-use stock gets no credit for what it leaves
            behind — plus 15% for dead volume.
          </div>
        )}
        {compounds.length === 0 && (
          <div className="space-y-2.5">
            <div className="text-xs text-muted-foreground">
              Add a compound above, or start from a recommended grouping. These pack every
              calibrated compound on the main gradient into as few standards as possible, keeping at
              least {MIN_RT_GAP_MIN.toFixed(2)} min between any two peaks sharing a vial. Everything
              stays editable once loaded.
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {MULTI_COMPOUND_STANDARDS.map((std) => {
                const { firstRt, lastRt, closestGapMin } = standardSpread(std);
                const rows = std.members.map((m) => ({ m, c: resolveMember(m, allCompounds) }));
                // While the library is still loading nothing resolves, and
                // saying "not in library" then is a claim about the library
                // rather than about the fetch -- it reads as "you don't own
                // any of these", which is the opposite of true.
                const missing = compoundsLoading ? 0 : rows.filter((r) => !r.c).length;
                return (
                  <div key={std.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{std.name}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {std.members.length} compounds · {firstRt.toFixed(2)}–{lastRt.toFixed(2)}{" "}
                          min · closest pair {closestGapMin.toFixed(2)} min
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs shrink-0"
                        disabled={compoundsLoading || missing === std.members.length}
                        onClick={() => applyPreset(std)}
                      >
                        Use this set
                      </Button>
                    </div>
                    <div className="space-y-0.5">
                      {rows.map(({ m, c }) => (
                        <div
                          key={m.name}
                          className={`flex items-baseline justify-between gap-3 text-[11px] ${c || compoundsLoading ? "" : "opacity-50"}`}
                        >
                          <span className="truncate">
                            {m.name}
                            {!c && !compoundsLoading && (
                              <span className="ml-1 italic">— not in library</span>
                            )}
                          </span>
                          <span className="tabular-nums text-muted-foreground shrink-0">
                            {m.rtMin.toFixed(3)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {std.note && (
                      <div className="text-[11px] text-muted-foreground">{std.note}</div>
                    )}
                    {std.caution && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-500">
                        {std.caution}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {POLAR_UNGROUPED.length} calibrated compounds eluting before 2 min aren't grouped: on
              this method they stack up in the void volume — seven of them inside a single{" "}
              {MIN_RT_GAP_MIN.toFixed(2)} min window — so any grouping built from these retention
              times would put peaks in one vial that can't be told apart. They need retention times
              from the aqueous method first.
            </div>
            <div className="text-[11px] text-muted-foreground">
              {RUN_ALONE.join(", ")} {RUN_ALONE.length === 1 ? "is" : "are"} calibrated but
              deliberately left out — still under development, run alone.
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {compounds.map((c) => (
            <div
              key={c.compoundId}
              className="flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs"
            >
              <span className="font-medium">{c.name}</span>
              <Input
                className="h-6 w-12 text-[11px] px-1"
                value={c.abbrev}
                onChange={(e) =>
                  setCompounds((prev) =>
                    prev.map((x) =>
                      x.compoundId === c.compoundId
                        ? { ...x, abbrev: e.target.value.toUpperCase() }
                        : x,
                    ),
                  )
                }
              />
              <span className="text-muted-foreground">stock</span>
              <Input
                className="h-6 w-16 text-[11px] px-1"
                type="number"
                step="0.1"
                value={c.stockConcMgPerMl}
                onChange={(e) =>
                  setCompounds((prev) =>
                    prev.map((x) =>
                      x.compoundId === c.compoundId
                        ? { ...x, stockConcMgPerMl: Number(e.target.value) || 1 }
                        : x,
                    ),
                  )
                }
              />
              <span className="text-muted-foreground">mg/mL</span>
              {stockToMakeUl(c.compoundId) > 0 && (
                <span
                  className="text-[10px] rounded bg-muted px-1 py-px tabular-nums whitespace-nowrap"
                  title="Primary stock this compound's whole ladder consumes, including the aliquot spent making its first intermediate, plus 15% for dead volume."
                >
                  make {stockToMakeUl(c.compoundId)} µL
                  <span className="text-muted-foreground">
                    {" "}
                    = {((stockToMakeUl(c.compoundId) * c.stockConcMgPerMl) / 1000).toFixed(2)} mg
                  </span>
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-5"
                onClick={() => removeCompound(c.compoundId)}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {allIntermediates.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Make these first — intermediate stocks</div>
          <p className="text-[11px] text-muted-foreground">
            These levels need less of the primary stock than the {floorUl}&nbsp;µL pipette floor
            allows, so they're drawn from a weaker stock instead. Each one is a dilution of the line
            above it, so make them in this order.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-[520px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1 pr-3">Stock</th>
                  <th className="pb-1 pr-3">From</th>
                  <th className="pb-1 pr-3 text-right">Aliquot</th>
                  <th className="pb-1 pr-3 text-right">Diluent</th>
                  <th className="pb-1 pr-3 text-right">Total</th>
                  <th className="pb-1 text-right">Gives</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {allIntermediates.map(({ compound, it }) => (
                  <tr key={compound.compoundId + it.label} className="border-t border-border">
                    <td className="py-1 pr-3">
                      <span className="text-[10px] rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 px-1 py-px">
                        {it.label}
                      </span>
                      <span className="ml-1.5 text-muted-foreground">{compound.name}</span>
                    </td>
                    <td className="py-1 pr-3 text-muted-foreground">{it.sourceLabel}</td>
                    <td className="py-1 pr-3 text-right">{Math.round(it.aliquotUl)} µL</td>
                    <td className="py-1 pr-3 text-right text-muted-foreground">
                      {Math.round(it.diluentUl)} µL
                    </td>
                    <td className="py-1 pr-3 text-right text-muted-foreground">
                      {Math.round(it.volumeUl)} µL
                    </td>
                    <td className="py-1 text-right">{it.concMgPerMl} mg/mL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {compounds.length > 0 && (
        <Card className="p-4 space-y-2 overflow-x-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Levels — concentration (mg/mL) per compound</div>
            <Button size="sm" variant="outline" onClick={addLevel}>
              <Plus className="size-3.5 mr-1" />
              Add level
            </Button>
          </div>

          {/* States what the pre-filled numbers are and where they came from,
              so an analyst can tell a recommendation from a decision. */}
          <div className="rounded border border-border bg-muted/30 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Recommended calibration range for these compounds
            </div>
            <table className="text-[11px] w-full">
              <tbody>
                {compounds.map((c) => {
                  const src = allCompounds.find((x) => x.id === c.compoundId);
                  const rec = src
                    ? recommendedLevels(src as unknown as { [k: string]: unknown })
                    : [];
                  const shown = rec.filter((v): v is number => v != null);
                  return (
                    <tr key={c.compoundId}>
                      <td className="pr-3 py-0.5 whitespace-nowrap">{c.name}</td>
                      <td className="py-0.5 font-mono text-muted-foreground">
                        {shown.length
                          ? shown.map((v) => v.toFixed(3)).join(" · ") + " mg/mL"
                          : "no recommended range on file"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-muted-foreground mt-1">
              Pre-filled below and fully editable. Derived from measured peak height targeting
              100–1800&nbsp;mAU; each level is a whole 5&nbsp;µL of 1&nbsp;mg/mL stock per
              1&nbsp;mL.
            </div>
            {snapIsUseful && (
              <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    These levels can be moved onto the <strong>bench grid</strong> — the
                    concentrations the fixed-volume pipettors make without changing a setting.
                    Nothing else about the set changes, and no extra standard is consumed.
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs shrink-0"
                    onClick={snapAllToGrid}
                  >
                    Snap to bench grid
                  </Button>
                </div>
                <table className="text-[11px] w-full">
                  <tbody>
                    {compounds.map((c) => {
                      const snapped = snapPreview.get(c.compoundId);
                      if (!snapped) {
                        return (
                          <tr key={c.compoundId}>
                            <td className="pr-3 py-0.5 whitespace-nowrap">{c.name}</td>
                            <td className="py-0.5 text-amber-700 dark:text-amber-500">
                              no strictly increasing fit on the grid — leave this one as typed
                            </td>
                          </tr>
                        );
                      }
                      const w = worstShift(snapped);
                      return (
                        <tr key={c.compoundId}>
                          <td className="pr-3 py-0.5 whitespace-nowrap">{c.name}</td>
                          <td className="py-0.5 font-mono text-muted-foreground tabular-nums">
                            {snapped.map((x) => x.point.concMgPerMl.toPrecision(3)).join(" · ")}
                          </td>
                          <td className="py-0.5 pl-3 text-right tabular-nums whitespace-nowrap">
                            <span
                              className={
                                w > 0.06
                                  ? "text-amber-700 dark:text-amber-500"
                                  : "text-muted-foreground"
                              }
                            >
                              worst {(w * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <table className="text-xs w-full min-w-[500px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-2">Level</th>
                {compounds.map((c) => (
                  <th key={c.compoundId} className="pb-1 pr-2">
                    {c.abbrev} mg/mL
                  </th>
                ))}
                {compounds.map((c) => (
                  <th key={c.compoundId + "-ul"} className="pb-1 pr-2 text-muted-foreground/70">
                    {c.abbrev} µL
                  </th>
                ))}
                <th className="pb-1 pr-2 text-muted-foreground/70">Diluent µL</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level, li) => (
                <tr key={li} className="border-t border-border">
                  <td className="py-1 pr-2 font-medium">
                    <Input
                      className="h-7 w-14 text-xs"
                      value={level.label}
                      onChange={(e) =>
                        setLevels((prev) =>
                          prev.map((l, i) => (i === li ? { ...l, label: e.target.value } : l)),
                        )
                      }
                    />
                  </td>
                  {compounds.map((c) => (
                    <td key={c.compoundId} className="py-1 pr-2">
                      <Input
                        className="h-7 w-20 text-xs"
                        type="number"
                        step="0.005"
                        value={level.conc[c.compoundId] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          setLevels((prev) =>
                            prev.map((l, i) =>
                              i === li ? { ...l, conc: { ...l.conc, [c.compoundId]: v } } : l,
                            ),
                          );
                        }}
                      />
                    </td>
                  ))}
                  {compounds.map((c) => {
                    const d = drawFor(li, c.compoundId);
                    return (
                      <td key={c.compoundId + "-ul"} className="py-1 pr-2 tabular-nums">
                        {d ? (
                          <span className={d.ok ? "" : "text-amber-700 dark:text-amber-400"}>
                            <span className="text-muted-foreground">{Math.round(d.volumeUl)}</span>
                            {d.fromFactor && (
                              <span className="ml-1 text-[10px] rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 px-1 py-px whitespace-nowrap">
                                1:{d.fromFactor}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 pr-2 text-muted-foreground tabular-nums">
                    {Math.round(diluentUl(li))}
                  </td>
                  <td>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={() => removeLevel(li)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {levels.some((_l, li) => levelIssues(li).length > 0) && (
                <tr>
                  <td colSpan={2 + compounds.length * 2} className="pt-2">
                    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 space-y-1">
                      {levels.map((l, li) => {
                        const issues = levelIssues(li);
                        if (!issues.length) return null;
                        return (
                          <div key={li} className="text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="font-medium">{l.label || `L${li + 1}`}:</span>{" "}
                            {issues.join("; ")}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Why this range (goes on the printed cut sheet)</Label>
        <Textarea
          rows={3}
          value={rangeReasoning}
          onChange={(e) => setRangeReasoning(e.target.value)}
          placeholder="Floor/ceiling reasoning, budget checks, anything the next analyst should know."
        />
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={!canSubmit || createMut.isPending}
          onClick={() => createMut.mutate()}
          data-guide="standard-set-submit"
        >
          <Download className="size-4 mr-1" />{" "}
          {createMut.isPending ? "Saving…" : "Save & Download Cut Sheet"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Standard Prep Freelance -- a compound-data-blind standard builder.
 *
 * Dustin, 2026-08-31: "This is just a straight 'I want these compounds in
 * this standard in this range, give me a logical spread between this high
 * and low standard' that abides by all our pipetting and round numbers/
 * divisible by 5 logic."
 *
 * Every other standard-prep flow (standard-set-flow.tsx) is built AROUND
 * a compound's own calibration data -- recommended levels pulled from
 * cal_l1..l6, retention-time-grouped presets, a "snap to the bench grid"
 * pass that reconciles against what the library already says a level
 * should be. Freelance is the deliberate opposite: no calibration lookups,
 * no presets, no library reconciliation. Dustin types the compounds, a low
 * and a high, and gets an even spread back on his own numbers.
 *
 * What it does NOT skip is the pipetting math. That isn't "compound data",
 * it's bench physics -- the 50 uL floor, the 5 uL grid, serial dilution via
 * intermediates when a level falls under the floor. Those come from
 * planCompoundStocks (intermediate-stocks.ts), the exact same engine
 * standard-set-flow.tsx uses, called here with freeform-generated levels
 * instead of library-derived ones. Persistence (createStandardSet) and the
 * cut sheet (generateStandardSetCutSheetPdf) are equally generic -- neither
 * one cares where the levels came from -- so both are reused unmodified.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCompounds } from "@/lib/compounds.functions";
import { createStandardSet, getStandardSet } from "@/lib/standard-preparations/standard-set.functions";
import { generateStandardSetCutSheetPdf } from "@/lib/standard-preparations/cutsheet-pdf";
import {
  planCompoundStocks, primaryLabel,
  type CompoundPlan, type LevelDraw,
} from "@/lib/standard-preparations/intermediate-stocks";
import { evenSpread } from "@/lib/standard-preparations/freeform-spread";
import { getPrepSettings } from "@/lib/sample-prep/master-data.functions";
import { qk } from "@/lib/query-keys";

interface FreelanceCompound {
  compoundId: string;
  name: string;
  abbrev: string;
  stockConcMgPerMl: number;
}
interface FreelanceLevel {
  label: string;
  conc: Record<string, number | null>;
}

const FALLBACK_MIN_PIPETTE_UL = 50;
const MIN_LEVELS = 2;
const MAX_LEVELS = 12;

function defaultAbbrev(name: string): string {
  const compact = name.replace(/[^A-Za-z0-9]/g, "");
  return compact.slice(0, 3).toUpperCase() || "C";
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function StandardPrepFreelanceFlow({ defaultAnalystName, userToken }: { defaultAnalystName: string; userToken: string }) {
  const navigate = useNavigate();
  const listCompoundsFn = useServerFn(listCompounds);
  const createFn = useServerFn(createStandardSet);
  const getSetFn = useServerFn(getStandardSet);
  const { data: allCompounds = [] } = useQuery({ queryKey: qk.compounds.list(), queryFn: () => listCompoundsFn() });
  const settingsQ = useQuery({ queryKey: ["sp-settings"], queryFn: () => getPrepSettings() });

  const [standardName, setStandardName] = useState("");
  const [analystName, setAnalystName] = useState(defaultAnalystName);
  const [diluentName, setDiluentName] = useState("Mobile Phase A");
  const [batchVolumeMl, setBatchVolumeMl] = useState("1");
  const [rangeReasoning, setRangeReasoning] = useState("");

  const [compounds, setCompounds] = useState<FreelanceCompound[]>([]);
  const [levels, setLevels] = useState<FreelanceLevel[]>(
    Array.from({ length: 6 }, (_, i) => ({ label: `L${i + 1}`, conc: {} })),
  );

  // Spread controls -- independent of the compound list. "Generate" fills
  // EVERY selected compound's row with the SAME ladder: one range governs
  // the whole standard, matching "these compounds in this standard in this
  // range." Standards (unlike blend samples) can hold arbitrary independent
  // per-compound concentrations, so nothing stops every compound sharing
  // identical targets -- it is just the natural reading of a single range.
  const [levelCount, setLevelCount] = useState("6");
  const [lowConc, setLowConc] = useState("");
  const [highConc, setHighConc] = useState("");

  const availableToAdd = allCompounds.filter(c => !compounds.some(gc => gc.compoundId === c.id));

  function addCompound(id: string) {
    const c = allCompounds.find(x => x.id === id);
    if (!c) return;
    setCompounds(prev => [...prev, { compoundId: c.id, name: c.name, abbrev: defaultAbbrev(c.name), stockConcMgPerMl: 1 }]);
  }
  function removeCompound(id: string) {
    setCompounds(prev => prev.filter(c => c.compoundId !== id));
    setLevels(prev => prev.map(l => { const { [id]: _drop, ...rest } = l.conc; return { ...l, conc: rest }; }));
  }

  function generateSpread() {
    const lo = Number(lowConc), hi = Number(highConc);
    const n = Math.min(MAX_LEVELS, Math.max(MIN_LEVELS, Math.round(Number(levelCount)) || 6));
    if (!(lo > 0) || !(hi > 0)) { toast.error("Enter a low and high concentration first."); return; }
    if (hi < lo) { toast.error("High standard has to be at or above the low standard."); return; }
    if (!compounds.length) { toast.error("Add at least one compound first."); return; }
    const spread = evenSpread(lo, hi, n);
    setLevels(spread.map((v, i) => ({
      label: `L${i + 1}`,
      conc: Object.fromEntries(compounds.map(c => [c.compoundId, v])),
    })));
    toast.success(`Generated ${n} levels, ${spread[0]} to ${spread[spread.length - 1]} mg/mL`);
  }
  function addLevel() {
    setLevels(prev => (prev.length >= MAX_LEVELS ? prev : [...prev, { label: `L${prev.length + 1}`, conc: {} }]));
  }
  function removeLevel(idx: number) {
    setLevels(prev => prev.filter((_, i) => i !== idx));
  }

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;
  const floorUl = settingsQ.data?.absolute_min_pipette_ul ?? FALLBACK_MIN_PIPETTE_UL;

  const plans = useMemo(() => {
    const map = new Map<string, CompoundPlan>();
    for (const c of compounds) {
      map.set(c.compoundId, planCompoundStocks({
        compoundId: c.compoundId, abbrev: c.abbrev, stockConcMgPerMl: c.stockConcMgPerMl,
        batchUl, floorUl, concByLevel: levels.map(l => l.conc[c.compoundId] ?? null),
      }));
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
  function stockToMakeUl(compoundId: string): number {
    const plan = plans.get(compoundId);
    if (!plan) return 0;
    let direct = 0;
    for (const d of plan.draws.values()) if (!d.fromFactor) direct += d.volumeUl;
    const need = direct + (plan.intermediates[0]?.aliquotUl ?? 0);
    return need > 0 ? Math.ceil((need * 1.15) / 50) * 50 : 0;
  }
  const allIntermediates = compounds.flatMap(c =>
    (plans.get(c.compoundId)?.intermediates ?? []).map(it => ({ compound: c, it })),
  );

  /**
   * Same two-branch pipetting-feasibility check as the library flow (see
   * standard-set-flow.tsx) -- this is bench physics, not calibration data,
   * so it stays. A level demanding more stock than the batch holds reads
   * "0 uL diluent" and looks finished unless flagged; a draw off an
   * intermediate needs a bigger batch to fix, a draw off the primary needs
   * a stronger stock instead -- the two remedies are opposite, so which one
   * shows depends on which is actually happening.
   */
  function levelIssues(levelIdx: number): string[] {
    const issues: string[] = [];
    if (!batchUl) return issues;
    const level = levels[levelIdx];
    const anyConc = compounds.some(c => level.conc[c.compoundId] != null);
    if (!anyConc) return issues;
    const used = stockUsedUl(levelIdx);
    if (used > batchUl + 0.5) {
      const viaIntermediate = compounds.filter(c => drawFor(levelIdx, c.compoundId)?.fromFactor);
      if (viaIntermediate.length) {
        issues.push(
          `needs ${Math.round(used)} µL of stock for a ${Math.round(batchUl)} µL batch — `
          + `${viaIntermediate.map(c => c.abbrev).join(", ")} draw${viaIntermediate.length === 1 ? "s" : ""} `
          + `from an intermediate, which multiplies the volume. Raise the batch volume so it can come straight from the primary.`,
        );
      } else {
        const ratio = compounds.reduce((sum, c) => {
          const v = level.conc[c.compoundId];
          return sum + (v != null && c.stockConcMgPerMl > 0 ? v / c.stockConcMgPerMl : 0);
        }, 0);
        issues.push(
          `needs ${Math.round(used)} µL of stock for a ${Math.round(batchUl)} µL batch`
          + ` — a bigger batch will not help, both scale together. Use primaries at least`
          + ` ${(Math.ceil(ratio * 100) / 100).toFixed(2)}x their current strength, or lower this level.`,
        );
      }
    } else if (used > batchUl * 0.9) {
      issues.push(`${Math.round((used / batchUl) * 100)}% of this level is stock — barely a dilution; a stronger primary stock would give more room`);
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
        intermediate_steps: allIntermediates.map(({ compound, it }) => ({
          compound_id: compound.compoundId, compound_name: compound.name,
          label: it.label, source_label: it.sourceLabel, factor: it.factor,
          concentration_mg_per_ml: round2(it.concMgPerMl), aliquot_ul: round2(it.aliquotUl),
          diluent_ul: round2(it.diluentUl), volume_ul: round2(it.volumeUl),
        })),
        levels: levels.map((l, i) => ({
          row_no: i + 1,
          label: l.label,
          components: compounds
            .filter(c => l.conc[c.compoundId] != null)
            .map(c => {
              const d = drawFor(i, c.compoundId);
              return {
                compound_id: c.compoundId, compound_name: c.name, abbrev: c.abbrev,
                concentration_mg_per_ml: l.conc[c.compoundId],
                stock_volume_ul: d ? round2(d.volumeUl) : null,
                source_label: d?.sourceLabel ?? primaryLabel(c.abbrev),
              };
            }),
          diluent_volume_ul: round2(diluentUl(i)),
          expected_note: null,
        })).filter(l => l.components.length > 0),
      };
      const created = await createFn({ data: payload });
      const detail = await getSetFn({ data: { id: created.id } });
      const factorByLabel = new Map(detail.intermediateSteps.map(it => [it.label, it.factor]));
      const doc = generateStandardSetCutSheetPdf({
        standardName: detail.standard_name,
        logNumber: detail.log_number,
        preparedAt: detail.prepared_at,
        analystName: detail.analyst_name,
        diluentName: detail.final_diluent ?? diluentName,
        batchVolumeMl: detail.final_volume_ml ?? Number(batchVolumeMl),
        levels: detail.levels.map(l => ({
          label: l.label,
          components: l.components.map(c => ({
            abbrev: compounds.find(gc => gc.name === c.compound_name)?.abbrev ?? defaultAbbrev(c.compound_name),
            concMgPerMl: c.concentration_mg_per_ml,
            stockUl: c.stock_volume_ul,
            sourceLabel: c.source_label,
            sourceFactor: c.source_label ? factorByLabel.get(c.source_label) ?? null : null,
          })),
          diluentUl: l.diluent_volume_ul,
          expectedNote: l.expected_note,
        })),
        intermediates: detail.intermediateSteps.map(it => ({
          compoundName: it.compound_name, label: it.label, sourceLabel: it.source_label,
          concMgPerMl: it.concentration_mg_per_ml, aliquotUl: it.aliquot_ul,
          diluentUl: it.diluent_ul, volumeUl: it.volume_ul,
        })),
        rangeReasoning: rangeReasoning || "Freeform range — not derived from library calibration data.",
        reviewerName: detail.reviewer_name,
        approvedAt: detail.approved_at,
      });
      doc.save(`${detail.log_number}_cutsheet.pdf`);
      return created;
    },
    onSuccess: (res) => {
      toast.success(`Saved ${res.log_number} — cut sheet downloaded`);
      navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = standardName.trim() && compounds.length > 0 && levels.some(l => compounds.some(c => l.conc[c.compoundId] != null));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Standard Prep Freelance</h1>
        <p className="text-sm text-muted-foreground">
          Pick compounds, type a low and a high standard, get an even spread — no calibration lookups, no presets.
          Still enforces the 50&nbsp;µL floor and the 5&nbsp;µL grid: a level that would need a sub-floor aliquot
          is served from an automatic serial dilution instead of refused.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Standard name</Label>
            <Input value={standardName} onChange={e => setStandardName(e.target.value)} placeholder="e.g. Ad-hoc panel 0.5-5.0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Analyst</Label>
            <Input value={analystName} onChange={e => setAnalystName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diluent</Label>
            <Input value={diluentName} onChange={e => setDiluentName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Batch volume (mL, per level)</Label>
            <Input type="number" step="0.1" value={batchVolumeMl} onChange={e => setBatchVolumeMl(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Compounds</div>
          <Select value="" onValueChange={addCompound}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Add a compound..." /></SelectTrigger>
            <SelectContent>
              {availableToAdd.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_blend ? " (blend)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {compounds.length === 0 && <div className="text-xs text-muted-foreground">Add at least one compound, then set your range below.</div>}
        <div className="flex flex-wrap gap-2">
          {compounds.map(c => (
            <div key={c.compoundId} className="flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs">
              <span className="font-medium">{c.name}</span>
              <Input
                className="h-6 w-12 text-[11px] px-1" value={c.abbrev}
                onChange={e => setCompounds(prev => prev.map(x => x.compoundId === c.compoundId ? { ...x, abbrev: e.target.value.toUpperCase() } : x))}
              />
              <span className="text-muted-foreground">stock</span>
              <Input
                className="h-6 w-16 text-[11px] px-1" type="number" step="0.1" value={c.stockConcMgPerMl}
                onChange={e => setCompounds(prev => prev.map(x => x.compoundId === c.compoundId ? { ...x, stockConcMgPerMl: Number(e.target.value) || 1 } : x))}
              />
              <span className="text-muted-foreground">mg/mL</span>
              {stockToMakeUl(c.compoundId) > 0 && (
                <span className="text-[10px] rounded bg-muted px-1 py-px tabular-nums whitespace-nowrap"
                  title="Primary stock this compound's whole ladder consumes, including the aliquot spent making its first intermediate, plus 15% for dead volume.">
                  make {stockToMakeUl(c.compoundId)} µL
                </span>
              )}
              <Button size="icon" variant="ghost" className="size-5" onClick={() => removeCompound(c.compoundId)}>
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Range</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Low standard (mg/mL)</Label>
            <Input type="number" step="0.005" value={lowConc} onChange={e => setLowConc(e.target.value)} placeholder="e.g. 0.1" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">High standard (mg/mL)</Label>
            <Input type="number" step="0.005" value={highConc} onChange={e => setHighConc(e.target.value)} placeholder="e.g. 1.0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Levels</Label>
            <Input type="number" min={MIN_LEVELS} max={MAX_LEVELS} value={levelCount} onChange={e => setLevelCount(e.target.value)} />
          </div>
          <Button onClick={generateSpread}>Generate spread</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fills every compound above with the same evenly-spaced ladder from low to high, on the 0.005&nbsp;mg/mL grid.
          Every cell stays editable afterward — this is a starting point, not a lock.
        </p>
      </Card>

      {allIntermediates.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Make these first — intermediate stocks</div>
          <p className="text-[11px] text-muted-foreground">
            These levels need less of the primary stock than the {floorUl}&nbsp;µL pipette floor allows,
            so they are drawn from a weaker stock instead. Each one is a dilution of the line above it,
            so make them in this order.
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
                      <span className="text-[10px] rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 px-1 py-px">{it.label}</span>
                      <span className="ml-1.5 text-muted-foreground">{compound.name}</span>
                    </td>
                    <td className="py-1 pr-3 text-muted-foreground">{it.sourceLabel}</td>
                    <td className="py-1 pr-3 text-right">{Math.round(it.aliquotUl)} µL</td>
                    <td className="py-1 pr-3 text-right text-muted-foreground">{Math.round(it.diluentUl)} µL</td>
                    <td className="py-1 pr-3 text-right text-muted-foreground">{Math.round(it.volumeUl)} µL</td>
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
            <Button size="sm" variant="outline" onClick={addLevel} disabled={levels.length >= MAX_LEVELS}>
              <Plus className="size-3.5 mr-1" />Add level
            </Button>
          </div>
          <table className="text-xs w-full min-w-[500px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-2">Level</th>
                {compounds.map(c => <th key={c.compoundId} className="pb-1 pr-2">{c.abbrev} mg/mL</th>)}
                {compounds.map(c => <th key={c.compoundId + "-ul"} className="pb-1 pr-2 text-muted-foreground/70">{c.abbrev} µL</th>)}
                <th className="pb-1 pr-2 text-muted-foreground/70">Diluent µL</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level, li) => (
                <tr key={li} className="border-t border-border">
                  <td className="py-1 pr-2 font-medium">
                    <Input className="h-7 w-14 text-xs" value={level.label}
                      onChange={e => setLevels(prev => prev.map((l, i) => i === li ? { ...l, label: e.target.value } : l))} />
                  </td>
                  {compounds.map(c => (
                    <td key={c.compoundId} className="py-1 pr-2">
                      <Input
                        className="h-7 w-20 text-xs" type="number" step="0.005"
                        value={level.conc[c.compoundId] ?? ""}
                        onChange={e => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          setLevels(prev => prev.map((l, i) => i === li ? { ...l, conc: { ...l.conc, [c.compoundId]: v } } : l));
                        }}
                      />
                    </td>
                  ))}
                  {compounds.map(c => {
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
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                    );
                  })}
                  <td className="py-1 pr-2 text-muted-foreground tabular-nums">{Math.round(diluentUl(li))}</td>
                  <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeLevel(li)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
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
                            <span className="font-medium">{l.label || `L${li + 1}`}:</span> {issues.join("; ")}
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
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)}
          placeholder="This is a freeform range, not derived from the compound library -- say what it is for." />
      </Card>

      <div className="flex justify-end">
        <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? "Saving..." : "Save & Download Cut Sheet"}
        </Button>
      </div>
    </div>
  );
}

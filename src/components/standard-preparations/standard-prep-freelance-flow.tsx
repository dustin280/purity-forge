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
 * The pipetting math comes from prep-calculator.ts, 2026-09-01, after a
 * KLOW overflow case (4 compounds, 5000 uL flask, 15000 uL of stock
 * needed) surfaced as a soft warning instead of a hard failure. That
 * module computes each LEVEL as a unit -- every compound in it checked
 * together against one flask_ul -- and returns possible:false with a
 * reason and fix suggestions when a level genuinely cannot be made,
 * rather than silently clamping diluent to zero and hoping someone
 * notices. Each level is computed independently of every other, per its
 * own spec: a bad L6 does not affect L1.
 */
import { Fragment, useMemo, useState } from "react";
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
import { primaryLabel } from "@/lib/standard-preparations/intermediate-stocks";
import { computeLevel, type PrepLevelResult } from "@/lib/standard-preparations/prep-calculator";
import { evenSpread } from "@/lib/standard-preparations/freeform-spread";
import { freelanceRunListCsv } from "@/lib/standard-preparations/freeform-run-list";
import { generateFreelanceLabelSheetPdf } from "@/lib/standard-preparations/freeform-label-sheet";
import { type FreelanceNamingLevel } from "@/lib/standard-preparations/freeform-sample-name";
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

/**
 * The 5 µL grid moves a draw off its exact target by a small, real amount --
 * shown rather than hidden, same as every other rounding boundary in this
 * app. Null when the deviation is floating-point noise, not something
 * grid-rounding actually did.
 */
function achievedDeviation(comp: { target_mg_ml: number; achieved_mg_ml: number }): string | null {
  if (!(comp.target_mg_ml > 0)) return null;
  const rel = Math.abs(comp.achieved_mg_ml - comp.target_mg_ml) / comp.target_mg_ml;
  if (rel < 0.001) return null;
  return comp.achieved_mg_ml.toString();
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

  // Spread controls -- independent of the compound list. "Generate" targets
  // ONE compound at a time by default (targetCompoundId, auto-set to
  // whichever was just added) and MERGES its values into the grid, leaving
  // every other compound's already-generated levels untouched.
  const ALL_COMPOUNDS = "__all__";
  const [targetCompoundId, setTargetCompoundId] = useState("");
  const [levelCount, setLevelCount] = useState("6");
  const [lowConc, setLowConc] = useState("");
  const [highConc, setHighConc] = useState("");

  const availableToAdd = allCompounds.filter(c => !compounds.some(gc => gc.compoundId === c.id));

  function selectTarget(id: string) {
    setTargetCompoundId(id);
    setLowConc(""); setHighConc("");
  }
  function addCompound(id: string) {
    const c = allCompounds.find(x => x.id === id);
    if (!c) return;
    setCompounds(prev => [...prev, { compoundId: c.id, name: c.name, abbrev: defaultAbbrev(c.name), stockConcMgPerMl: 1 }]);
    selectTarget(c.id);
  }
  function removeCompound(id: string) {
    const next = compounds.filter(c => c.compoundId !== id);
    setCompounds(next);
    setTargetCompoundId(t => (t === id ? (next[0]?.compoundId ?? "") : t));
    setLevels(prev => prev.map(l => { const { [id]: _drop, ...rest } = l.conc; return { ...l, conc: rest }; }));
  }

  function generateSpread() {
    const lo = Number(lowConc), hi = Number(highConc);
    const n = Math.min(MAX_LEVELS, Math.max(MIN_LEVELS, Math.round(Number(levelCount)) || 6));
    if (!(lo > 0) || !(hi > 0)) { toast.error("Enter a low and high concentration first."); return; }
    if (hi < lo) { toast.error("High standard has to be at or above the low standard."); return; }
    if (!compounds.length) { toast.error("Add at least one compound first."); return; }
    if (!targetCompoundId) { toast.error("Pick which compound this range is for."); return; }
    const applyToAll = targetCompoundId === ALL_COMPOUNDS;
    const targetIds = applyToAll ? compounds.map(c => c.compoundId) : [targetCompoundId];
    const spread = evenSpread(lo, hi, n);
    setLevels(prev => {
      const rows = prev.length >= spread.length ? prev : [
        ...prev,
        ...Array.from({ length: spread.length - prev.length }, (_, i) => ({
          label: `L${prev.length + i + 1}`, conc: {} as Record<string, number | null>,
        })),
      ];
      return rows.map((row, i) => {
        if (i >= spread.length) return row;
        const conc = { ...row.conc };
        for (const id of targetIds) conc[id] = spread[i];
        return { ...row, conc };
      });
    });
    const who = applyToAll ? "every compound" : compounds.find(c => c.compoundId === targetCompoundId)?.name ?? "this compound";
    toast.success(`Generated ${n} levels for ${who}, ${spread[0]} to ${spread[spread.length - 1]} mg/mL`);
  }
  function addLevel() {
    setLevels(prev => (prev.length >= MAX_LEVELS ? prev : [...prev, { label: `L${prev.length + 1}`, conc: {} }]));
  }
  function removeLevel(idx: number) {
    setLevels(prev => prev.filter((_, i) => i !== idx));
  }

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;
  const floorUl = settingsQ.data?.absolute_min_pipette_ul ?? FALLBACK_MIN_PIPETTE_UL;

  const engineStocks = useMemo(
    () => compounds.map(c => ({ compound_id: c.compoundId, conc_mg_ml: c.stockConcMgPerMl })),
    [compounds],
  );
  const engineCompounds = useMemo(
    () => compounds.map(c => ({ id: c.compoundId, name: c.name })),
    [compounds],
  );

  // One computeLevel call per row -- each level is its own, fully
  // independent feasibility check, matching the calculator's own rule
  // ("a bad L6 does not contaminate L1"). A row with no concentrations
  // entered anywhere isn't a real level yet, so it's skipped rather than
  // reported as an empty "possible" recipe.
  const levelResults: Array<PrepLevelResult | null> = useMemo(() => {
    if (!batchUl) return levels.map(() => null);
    return levels.map((level, i) => {
      const targets = compounds
        .filter(c => level.conc[c.compoundId] != null)
        .map(c => ({ compound_id: c.compoundId, conc_mg_ml: level.conc[c.compoundId]! }));
      if (!targets.length) return null;
      return computeLevel({
        level_id: level.label || `L${i + 1}`,
        flask_ul: batchUl,
        targets,
        compounds: engineCompounds,
        stocks: engineStocks,
        options: {
          diluent_name: diluentName, allow_serial: true, min_pipette_ul: floorUl,
          preferred_min_pipette_ul: settingsQ.data?.preferred_min_pipette_ul, max_serial_steps: 2,
        },
      });
    });
  }, [levels, compounds, engineCompounds, engineStocks, batchUl, floorUl, diluentName, settingsQ.data?.preferred_min_pipette_ul]);

  function componentFor(levelIdx: number, compoundName: string) {
    const r = levelResults[levelIdx];
    if (!r || !r.possible) return null;
    return r.components.find(c => c.compound === compoundName) ?? null;
  }

  /** Primary stock a compound's WHOLE ladder consumes, across every level
   * where that level is actually makeable. A serial component draws its
   * intermediate from the primary only via the first step -- the second
   * step draws from that intermediate, not from the primary stock itself.
   * That first-step aliquot is a ONE-TIME cost per (compound, factor): every
   * level sharing the same factor draws from the same bottle, so only the
   * first occurrence of a given factor charges the primary -- counting it
   * per level would charge for intermediate stock never actually made. */
  function stockToMakeUl(compoundId: string, compoundName: string): number {
    let need = 0;
    const chargedFactors = new Set<number>();
    levelResults.forEach(r => {
      if (!r || !r.possible) return;
      const comp = r.components.find(c => c.compound === compoundName);
      if (!comp) return;
      if (comp.take_ul != null) {
        need += comp.take_ul;
      } else if (comp.serial) {
        const factor = comp.serial[0].factor;
        if (!chargedFactors.has(factor)) {
          chargedFactors.add(factor);
          need += comp.serial[0].take_ul;
        }
      }
    });
    return need > 0 ? Math.ceil((need * 1.15) / 50) * 50 : 0;
  }

  const canSubmit = Boolean(
    standardName.trim() && compounds.length > 0
    && levels.some((l, i) => compounds.some(c => l.conc[c.compoundId] != null) && levelResults[i]?.possible)
    && levels.every((_l, i) => levelResults[i] == null || levelResults[i]!.possible),
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const intermediateSteps: Array<{
        compound_id: string; compound_name: string; label: string; source_label: string;
        factor: number; concentration_mg_per_ml: number; aliquot_ul: number; diluent_ul: number; volume_ul: number;
      }> = [];
      // One shared intermediate per (compound, factor) -- a 1:10 of NAD is
      // the same bottle whether L1, L2, or L3 draws from it, so it's made
      // once and every level that needs it points at the same label instead
      // of each level minting its own identical "make this too" row.
      const intermediateLabelByKey = new Map<string, string>();

      const payload = {
        prepared_at: new Date().toISOString(),
        analyst_name: analystName,
        user_token: userToken,
        standard_name: standardName,
        diluent_name: diluentName,
        batch_volume_ml: Number(batchVolumeMl) || 1,
        range_reasoning: rangeReasoning || null,
        levels: levels.map((l, i) => {
          const result = levelResults[i];
          if (!result || !result.possible) return { row_no: i + 1, label: l.label, components: [], diluent_volume_ul: 0, expected_note: null };
          const rowComponents = compounds
            .filter(c => l.conc[c.compoundId] != null)
            .map(c => {
              const comp = result.components.find(x => x.compound === c.name);
              if (!comp) return null;
              if (comp.take_ul != null) {
                return {
                  compound_id: c.compoundId, compound_name: c.name, abbrev: c.abbrev,
                  concentration_mg_per_ml: comp.target_mg_ml,
                  stock_volume_ul: round2(comp.take_ul),
                  source_label: primaryLabel(c.abbrev),
                };
              }
              // Serial: persist the first (intermediate-making) step as its
              // own entry -- once per (compound, factor), shared across
              // every level that draws from it -- and record the level's own
              // draw as coming FROM that intermediate (the second step's
              // take_ul).
              const step1 = comp.serial![0];
              const step2 = comp.serial![1];
              const key = `${c.compoundId}:${round2(step1.factor)}`;
              let label = intermediateLabelByKey.get(key);
              if (!label) {
                label = `${c.abbrev} 1:${round2(step1.factor)}`;
                intermediateLabelByKey.set(key, label);
                intermediateSteps.push({
                  compound_id: c.compoundId, compound_name: c.name, label,
                  source_label: primaryLabel(c.abbrev), factor: step1.factor,
                  concentration_mg_per_ml: round2(step1.resulting_conc),
                  aliquot_ul: round2(step1.take_ul), diluent_ul: round2(step1.diluent_ul),
                  volume_ul: round2(step1.take_ul + step1.diluent_ul),
                });
              }
              return {
                compound_id: c.compoundId, compound_name: c.name, abbrev: c.abbrev,
                concentration_mg_per_ml: comp.target_mg_ml,
                stock_volume_ul: round2(step2.take_ul),
                source_label: label,
              };
            })
            .filter((c): c is NonNullable<typeof c> => c != null);
          return {
            row_no: i + 1, label: l.label, components: rowComponents,
            diluent_volume_ul: round2(result.diluent_ul), expected_note: null,
          };
        }).filter(l => l.components.length > 0),
        intermediate_steps: intermediateSteps,
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

  // Shape shared by the run list and the label sheet -- both need exactly
  // the same per-level compound/concentration list, and both need it to be
  // the sample-name convention's input, not the raw grid state. Only levels
  // the calculator confirms are actually makeable go out on a label or a
  // sequence row.
  const namingLevels: FreelanceNamingLevel[] = useMemo(() => levels
    .map((l, i) => ({
      label: l.label,
      possible: levelResults[i]?.possible ?? false,
      components: compounds
        .filter(c => l.conc[c.compoundId] != null)
        .map(c => ({ name: c.name, concMgPerMl: l.conc[c.compoundId]! })),
    }))
    .filter(l => l.components.length > 0 && l.possible)
    .map(({ label, components }) => ({ label, components })), [levels, compounds, levelResults]);

  function exportFilenameStem(): string {
    return (standardName.trim() || "standard-prep-freelance").replace(/[^A-Za-z0-9_-]+/g, "_");
  }

  function downloadRunList() {
    if (!standardName.trim()) { toast.error("Enter a standard name first — it goes into every sample name."); return; }
    if (!namingLevels.length) { toast.error("No makeable levels yet — fix any failed levels first."); return; }
    const csv = freelanceRunListCsv(standardName, namingLevels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportFilenameStem()}_runlist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadLabelSheet() {
    if (!standardName.trim()) { toast.error("Enter a standard name first — it goes into every label."); return; }
    if (!namingLevels.length) { toast.error("No makeable levels yet — fix any failed levels first."); return; }
    generateFreelanceLabelSheetPdf(standardName, namingLevels).save(`${exportFilenameStem()}_labels.pdf`);
  }

  const colCount = 2 + compounds.length * 2;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Standard Prep Freelance</h1>
        <p className="text-sm text-muted-foreground">
          Pick compounds, type a low and a high standard, get an even spread — no calibration lookups, no presets.
          Every level is checked as a whole against the batch volume before anything is offered: if the compounds
          in it genuinely cannot fit, the level says so and why, instead of quietly clamping diluent to zero.
          The run list and label sheet share one sample name per level —{" "}
          <code>L1 &lt;standard name&gt; B0.28 G0.14 &lt;D&gt;</code> — so a vial and its sequence row always read
          the same.
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
              {stockToMakeUl(c.compoundId, c.name) > 0 && (
                <span className="text-[10px] rounded bg-muted px-1 py-px tabular-nums whitespace-nowrap"
                  title="Primary stock this compound's whole ladder consumes across every makeable level, plus 15% for dead volume.">
                  make {stockToMakeUl(c.compoundId, c.name)} µL
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Apply to</Label>
            <Select value={targetCompoundId} onValueChange={selectTarget}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a compound" /></SelectTrigger>
              <SelectContent>
                {compounds.length > 1 && (
                  <SelectItem value={ALL_COMPOUNDS}>All compounds (same range for everyone)</SelectItem>
                )}
                {compounds.map(c => <SelectItem key={c.compoundId} value={c.compoundId}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          Fills the selected compound (or every compound, if you pick "All") with an evenly-spaced ladder from
          low to high, on the 0.005&nbsp;mg/mL grid. Other compounds' already-generated levels are left alone.
          Every cell stays editable afterward — this is a starting point, not a lock.
        </p>
      </Card>

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
              {levels.map((level, li) => {
                const result = levelResults[li];
                const hasAnyConc = compounds.some(c => level.conc[c.compoundId] != null);
                const failed = hasAnyConc && result != null && !result.possible;
                return (
                  <Fragment key={li}>
                    <tr className={`border-t border-border ${failed ? "bg-red-500/5" : ""}`}>
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
                        const comp = failed ? null : componentFor(li, c.name);
                        return (
                          <td key={c.compoundId + "-ul"} className="py-1 pr-2 tabular-nums">
                            {failed ? (
                              <span className="text-red-700 dark:text-red-400">—</span>
                            ) : comp ? (
                              comp.take_ul != null ? (
                                <span className="text-muted-foreground">
                                  {comp.take_ul}
                                  {achievedDeviation(comp) && (
                                    <span
                                      className="ml-1 text-[10px] text-amber-700 dark:text-amber-400 whitespace-nowrap"
                                      title={`5 µL grid rounding -- achieves ${comp.achieved_mg_ml} mg/mL, not the exact ${comp.target_mg_ml} target`}
                                    >
                                      ≈{achievedDeviation(comp)}
                                    </span>
                                  )}
                                </span>
                              ) : comp.serial ? (
                                <span
                                  className="text-muted-foreground"
                                  title={comp.serial.map((s, i) => `step ${i + 1}: ${s.take_ul} µL + ${s.diluent_ul} µL diluent → ${s.factor}×`).join("  •  ")
                                    + (achievedDeviation(comp) ? `  •  achieves ${comp.achieved_mg_ml} mg/mL, not the exact ${comp.target_mg_ml} target` : "")}
                                >
                                  {comp.serial[comp.serial.length - 1].take_ul}
                                  <span className="ml-1 text-[10px] rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 px-1 py-px whitespace-nowrap">
                                    {comp.serial.map(s => `${s.factor}×`).join("→")}
                                  </span>
                                  {achievedDeviation(comp) && (
                                    <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                      ≈{achievedDeviation(comp)}
                                    </span>
                                  )}
                                </span>
                              ) : null
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1 pr-2 text-muted-foreground tabular-nums">
                        {failed ? <span className="text-red-700 dark:text-red-400">—</span> : (result?.possible ? result.diluent_ul : "-")}
                      </td>
                      <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeLevel(li)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
                    </tr>
                    {failed && (
                      <tr>
                        <td colSpan={colCount} className="pb-2">
                          <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-700 dark:text-red-300">
                            <span className="font-medium">{level.label || `L${li + 1}`} — not possible:</span>{" "}
                            {(result as { reason: string }).reason}.
                            {(result as { fix_suggestions: string[] }).fix_suggestions.length > 0 && (
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                {(result as { fix_suggestions: string[] }).fix_suggestions.map((f, i) => <li key={i}>{f}</li>)}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {!failed && result?.possible && result.warnings.length > 0 && (
                      <tr>
                        <td colSpan={colCount} className="pb-2">
                          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="font-medium">{level.label || `L${li + 1}`}:</span>{" "}
                            {result.warnings.join("; ")}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Why this range (goes on the printed cut sheet)</Label>
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)}
          placeholder="This is a freeform range, not derived from the compound library -- say what it is for." />
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!namingLevels.length} onClick={downloadRunList}>
          Download Run List (CSV)
        </Button>
        <Button variant="outline" disabled={!namingLevels.length} onClick={downloadLabelSheet}>
          Download Label Sheet (PDF)
        </Button>
        <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? "Saving..." : "Save & Download Cut Sheet"}
        </Button>
      </div>
    </div>
  );
}

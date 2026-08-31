import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCompounds } from "@/lib/compounds.functions";
import { createStandardSet, getStandardSet } from "@/lib/standard-preparations/standard-set.functions";
import { generateStandardSetCutSheetPdf } from "@/lib/standard-preparations/cutsheet-pdf";
import {
  MULTI_COMPOUND_STANDARDS, POLAR_UNGROUPED, RUN_ALONE, MIN_RT_GAP_MIN,
  standardSpread, resolveMember, type MultiCompoundStandard,
} from "@/lib/standard-preparations/multi-compound-standards";
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

/** Smallest volume the bench can deliver accurately (sp_settings mirrors this). */
const MIN_PIPETTE_UL = 20;

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
export function StandardSetFlow({ defaultAnalystName, userToken }: { defaultAnalystName: string; userToken: string }) {
  const navigate = useNavigate();
  const listCompoundsFn = useServerFn(listCompounds);
  const createFn = useServerFn(createStandardSet);
  const getSetFn = useServerFn(getStandardSet);
  const { data: allCompounds = [] } = useQuery({ queryKey: qk.compounds.list(), queryFn: () => listCompoundsFn() });
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

  const availableToAdd = allCompounds.filter(c => !compounds.some(gc => gc.compoundId === c.id));

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
    const c = allCompounds.find(x => x.id === id);
    if (!c) return;
    setCompounds(prev => [...prev, {
      compoundId: c.id, name: c.name, abbrev: defaultAbbrev(c.name),
      stockConcMgPerMl: 1,
    }]);
    const rec = recommendedLevels(c as unknown as { [k: string]: unknown });
    if (rec.some(v => v != null)) {
      setLevels(prev => prev.map((l, i) => (
        rec[i] == null ? l : { ...l, conc: { ...l.conc, [c.id]: rec[i] } }
      )));
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
      .map(m => ({ m, c: resolveMember(m, allCompounds) }))
      .flatMap(({ m, c }) => (c ? [{ m, c }] : []));
    if (!resolved.length) {
      toast.error(`None of ${std.name}'s compounds are in the library yet.`);
      return;
    }
    setCompounds(resolved.map(({ m, c }) => ({
      compoundId: c.id, name: c.name, abbrev: m.abbrev, stockConcMgPerMl: 1,
    })));
    setLevels(prev => prev.map((level, i) => {
      const conc: Record<string, number | null> = {};
      for (const { c } of resolved) {
        const rec = recommendedLevels(c as unknown as { [k: string]: unknown })[i];
        if (rec != null) conc[c.id] = rec;
      }
      return { ...level, conc };
    }));
    if (!standardName.trim()) setStandardName(std.name);
    const missing = std.members.length - resolved.length;
    toast.success(
      `Loaded ${std.name} — ${resolved.length} compound${resolved.length === 1 ? "" : "s"}`
      + (missing ? `, ${missing} not in the library` : ""),
    );
  }

  function removeCompound(id: string) {
    setCompounds(prev => prev.filter(c => c.compoundId !== id));
    setLevels(prev => prev.map(l => { const { [id]: _drop, ...rest } = l.conc; return { ...l, conc: rest }; }));
  }
  function addLevel() {
    setLevels(prev => [...prev, { label: `L${prev.length + 1}`, conc: {} }]);
  }
  function removeLevel(idx: number) {
    setLevels(prev => prev.filter((_, i) => i !== idx));
  }

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;

  function stockUl(level: GridLevel, c: GridCompound): number | null {
    const conc = level.conc[c.compoundId];
    if (conc == null || !c.stockConcMgPerMl) return null;
    return (conc / c.stockConcMgPerMl) * batchUl;
  }
  function stockUsedUl(level: GridLevel): number {
    return compounds.reduce((sum, c) => sum + (stockUl(level, c) ?? 0), 0);
  }
  function diluentUl(level: GridLevel): number {
    return Math.max(0, batchUl - stockUsedUl(level));
  }

  /**
   * Whether a level can actually be made at the bench.
   *
   * diluentUl clamps at zero, so a level demanding more stock than the batch
   * volume used to display a tidy "0 µL diluent" and look finished -- an
   * impossible prep that reads as a valid one. The pipette floor matters the
   * same way: an aliquot under 20 µL cannot be delivered accurately, and a
   * level that is essentially neat stock isn't a dilution at all.
   */
  function levelIssues(level: GridLevel): string[] {
    const issues: string[] = [];
    if (!batchUl) return issues;
    const used = stockUsedUl(level);
    const anyConc = compounds.some(c => level.conc[c.compoundId] != null);
    if (!anyConc) return issues;

    if (used > batchUl + 0.5) {
      issues.push(`needs ${Math.round(used)} µL of stock but the batch is only ${Math.round(batchUl)} µL — raise the batch volume or use a stronger primary stock`);
    } else if (used > batchUl * 0.9) {
      issues.push(`${Math.round((used / batchUl) * 100)}% of this level is stock — barely a dilution; a stronger primary stock would give more room`);
    }
    for (const c of compounds) {
      const v = stockUl(level, c);
      if (v != null && v > 0 && v < MIN_PIPETTE_UL) {
        issues.push(`${c.abbrev} aliquot is ${Math.round(v)} µL, below the ${MIN_PIPETTE_UL} µL minimum — raise the batch volume or dilute the stock first`);
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
        levels: levels.map((l, i) => ({
          row_no: i + 1,
          label: l.label,
          components: compounds
            .filter(c => l.conc[c.compoundId] != null)
            .map(c => ({
              compound_id: c.compoundId,
              compound_name: c.name,
              abbrev: c.abbrev,
              concentration_mg_per_ml: l.conc[c.compoundId],
              stock_volume_ul: stockUl(l, c) != null ? Math.round(stockUl(l, c)! * 100) / 100 : null,
            })),
          diluent_volume_ul: Math.round(diluentUl(l) * 100) / 100,
          expected_note: null,
        })).filter(l => l.components.length > 0),
      };
      const created = await createFn({ data: payload });
      const detail = await getSetFn({ data: { id: created.id } });
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
          })),
          diluentUl: l.diluent_volume_ul,
          expectedNote: l.expected_note,
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

  const canSubmit = standardName.trim() && compounds.length > 0 && levels.some(l => compounds.some(c => l.conc[c.compoundId] != null));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Standard name</Label>
            <Input value={standardName} onChange={e => setStandardName(e.target.value)} placeholder="e.g. SUMMIT Calibration Set" />
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
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Add a compound…" /></SelectTrigger>
            <SelectContent>
              {availableToAdd.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_blend ? " (blend)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {compounds.length === 0 && (
          <div className="space-y-2.5">
            <div className="text-xs text-muted-foreground">
              Add a compound above, or start from a recommended grouping. These pack every
              calibrated compound on the main gradient into as few standards as possible,
              keeping at least {MIN_RT_GAP_MIN.toFixed(2)} min between any two peaks sharing a vial.
              Everything stays editable once loaded.
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {MULTI_COMPOUND_STANDARDS.map(std => {
                const { firstRt, lastRt, closestGapMin } = standardSpread(std);
                const rows = std.members.map(m => ({ m, c: resolveMember(m, allCompounds) }));
                const missing = rows.filter(r => !r.c).length;
                return (
                  <div key={std.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{std.name}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {std.members.length} compounds · {firstRt.toFixed(2)}–{lastRt.toFixed(2)} min ·
                          {" "}closest pair {closestGapMin.toFixed(2)} min
                        </div>
                      </div>
                      <Button
                        size="sm" variant="secondary" className="h-7 text-xs shrink-0"
                        disabled={missing === std.members.length}
                        onClick={() => applyPreset(std)}
                      >
                        Use this set
                      </Button>
                    </div>
                    <div className="space-y-0.5">
                      {rows.map(({ m, c }) => (
                        <div
                          key={m.name}
                          className={`flex items-baseline justify-between gap-3 text-[11px] ${c ? "" : "opacity-50"}`}
                        >
                          <span className="truncate">
                            {m.name}
                            {!c && <span className="ml-1 italic">— not in library</span>}
                          </span>
                          <span className="tabular-nums text-muted-foreground shrink-0">{m.rtMin.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                    {std.note && <div className="text-[11px] text-muted-foreground">{std.note}</div>}
                    {std.caution && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-500">{std.caution}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {POLAR_UNGROUPED.length} calibrated compounds eluting before 2 min aren't grouped: on this
              method they stack up in the void volume — seven of them inside a single{" "}
              {MIN_RT_GAP_MIN.toFixed(2)} min window — so any grouping built from these retention times
              would put peaks in one vial that can't be told apart. They need retention times from the
              aqueous method first.
            </div>
            <div className="text-[11px] text-muted-foreground">
              {RUN_ALONE.join(", ")} {RUN_ALONE.length === 1 ? "is" : "are"} calibrated but deliberately
              left out — still under development, run alone.
            </div>
          </div>
        )}
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
              <Button size="icon" variant="ghost" className="size-5" onClick={() => removeCompound(c.compoundId)}>
                <Trash2 className="size-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {compounds.length > 0 && (
        <Card className="p-4 space-y-2 overflow-x-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Levels — concentration (mg/mL) per compound</div>
            <Button size="sm" variant="outline" onClick={addLevel}><Plus className="size-3.5 mr-1" />Add level</Button>
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
                  const src = allCompounds.find(x => x.id === c.compoundId);
                  const rec = src ? recommendedLevels(src as unknown as { [k: string]: unknown }) : [];
                  const shown = rec.filter((v): v is number => v != null);
                  return (
                    <tr key={c.compoundId}>
                      <td className="pr-3 py-0.5 whitespace-nowrap">{c.name}</td>
                      <td className="py-0.5 font-mono text-muted-foreground">
                        {shown.length ? shown.map(v => v.toFixed(3)).join(" · ") + " mg/mL" : "no recommended range on file"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-muted-foreground mt-1">
              Pre-filled below and fully editable. Derived from measured peak height targeting 100–1800&nbsp;mAU;
              each level is a whole 5&nbsp;µL of 1&nbsp;mg/mL stock per 1&nbsp;mL.
            </div>
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
                  {compounds.map(c => (
                    <td key={c.compoundId + "-ul"} className="py-1 pr-2 text-muted-foreground tabular-nums">
                      {stockUl(level, c) != null ? Math.round(stockUl(level, c)!) : "—"}
                    </td>
                  ))}
                  <td className="py-1 pr-2 text-muted-foreground tabular-nums">{Math.round(diluentUl(level))}</td>
                  <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeLevel(li)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
                </tr>
              ))}
              {levels.some(l => levelIssues(l).length > 0) && (
                <tr>
                  <td colSpan={2 + compounds.length * 2} className="pt-2">
                    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 space-y-1">
                      {levels.map((l, li) => {
                        const issues = levelIssues(l);
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
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)} placeholder="Floor/ceiling reasoning, budget checks, anything the next analyst should know." />
      </Card>

      <div className="flex justify-end">
        <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()} data-guide="standard-set-submit">
          <Download className="size-4 mr-1" /> {createMut.isPending ? "Saving…" : "Save & Download Cut Sheet"}
        </Button>
      </div>
    </div>
  );
}

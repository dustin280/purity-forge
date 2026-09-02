/**
 * Full recipe correction for an already-submitted Standard Set / Standard
 * Prep Freelance record. Dustin, 2026-09-02: after a float-noise bug and an
 * overflow-math bug both reached printed cut sheets this session and had to
 * be hand-corrected in the database, "there is no way to edit or add notes
 * to an existing preparation" -- picked full recipe editing, then "it
 * should recalculate so you can save a new updated variation."
 *
 * The stock concentration each component was actually drawn from was never
 * persisted (only the resulting draw was) -- there's nothing to recompute
 * FROM until one exists. So on load, every component's stock concentration
 * is back-derived once from what WAS recorded: for a component sourced from
 * a listed intermediate, that intermediate's own concentration_mg_per_ml
 * (already stored); otherwise algebraically from the primary draw itself
 * (concentration_mg_per_ml * flask_ul / stock_volume_ul -- exact, since
 * that's the same equation that produced the recorded draw in the first
 * place). That derived number becomes a real, editable "Stock mg/mL" field
 * -- from there, changing any ONE of target concentration / stock
 * concentration / draw volume recomputes whichever of the other two wasn't
 * just touched, live, on the 5 uL grid, the same grid every other pipetted
 * volume in this app is held to. Diluent is never independently typed --
 * it's always flask_ul minus whatever the components actually draw.
 *
 * Recompute stops at the component boundary: changing an intermediate's own
 * concentration does NOT cascade to components sourced from it. Full
 * transitive recompute through the intermediate chain is a real gap, not
 * a design choice -- flagged in the intermediates card itself.
 *
 * Deliberately does not support adding a new level or a new compound to an
 * existing prep: "add new material to an already-made vial" isn't really
 * an edit of what happened, it's a new preparation. Levels/components can
 * be removed (struck from the record) and every remaining value edited.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { roundToVolumeGrid } from "@/lib/sample-prep/dilution";
import type { StandardSetDetail } from "@/lib/standard-preparations/standard-set.functions";
import { abbrevFor } from "@/lib/standard-preparations/standard-set-run-list";

interface EditComponent {
  compound_id: string | null;
  compound_name: string;
  concentration_mg_per_ml: number | null;
  stock_volume_ul: number | null;
  source_label: string | null;
  /** Back-derived once at load, then a real editable field -- see module
   * doc. Local to this form; never sent to the server (not persisted). */
  stock_mg_ml: number | null;
}
interface EditLevel {
  row_no: number;
  label: string;
  components: EditComponent[];
  expected_note: string | null;
}
interface EditIntermediate {
  compound_name: string;
  label: string;
  source_label: string;
  factor: number;
  concentration_mg_per_ml: number | null;
  aliquot_ul: number | null;
  diluent_ul: number | null;
  volume_ul: number | null;
}

export interface RecipeEditPayload {
  revised_from_id: string;
  standard_name: string;
  diluent_name: string;
  batch_volume_ml: number;
  range_reasoning: string | null;
  levels: Array<{
    row_no: number;
    label: string;
    components: Array<Omit<EditComponent, "stock_mg_ml"> & { abbrev: string }>;
    diluent_volume_ul: number | null;
    expected_note: string | null;
  }>;
  intermediate_steps: EditIntermediate[];
  summary: string;
}

function numOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
}

/** What this component actually draws from -- an intermediate's own
 * recorded concentration if it's sourced from one, otherwise the exact
 * concentration algebra backs out of the recorded target and volume. */
function deriveStockConc(c: EditComponent, intermediates: EditIntermediate[], flaskUl: number): number | null {
  if (c.source_label) {
    const inter = intermediates.find(it => it.label === c.source_label);
    if (inter?.concentration_mg_per_ml != null && inter.concentration_mg_per_ml > 0) return inter.concentration_mg_per_ml;
  }
  if (c.concentration_mg_per_ml != null && c.concentration_mg_per_ml > 0
    && c.stock_volume_ul != null && c.stock_volume_ul > 0 && flaskUl > 0) {
    return (c.concentration_mg_per_ml * flaskUl) / c.stock_volume_ul;
  }
  return null;
}
/** target_conc * flask_ul / stock_conc, grid-rounded -- the volume that
 * actually gets pipetted, same 5 uL grid as everything else in this app. */
function volumeFromConc(concMgMl: number | null, stockMgMl: number | null, flaskUl: number): number | null {
  if (!(concMgMl! > 0) || !(stockMgMl! > 0) || !(flaskUl > 0)) return null;
  return roundToVolumeGrid((concMgMl! * flaskUl) / stockMgMl!);
}
/** The inverse -- what a given draw actually delivers. 6 significant
 * figures strips float noise without erasing a real small value. */
function concFromVolume(volumeUl: number | null, stockMgMl: number | null, flaskUl: number): number | null {
  if (!(volumeUl! >= 0) || !(stockMgMl! > 0) || !(flaskUl > 0)) return null;
  return Number(((stockMgMl! * volumeUl!) / flaskUl).toPrecision(6));
}

export function StandardSetRecipeEdit({
  detail, saving, onSave, onCancel,
}: {
  detail: StandardSetDetail;
  saving: boolean;
  onSave: (payload: RecipeEditPayload) => void;
  onCancel: () => void;
}) {
  const [standardName, setStandardName] = useState(detail.standard_name);
  const [diluentName, setDiluentName] = useState(detail.final_diluent ?? "");
  const [batchVolumeMl, setBatchVolumeMl] = useState(String(detail.final_volume_ml ?? 1));
  const [rangeReasoning, setRangeReasoning] = useState(detail.notes ?? "");
  const [intermediates, setIntermediates] = useState<EditIntermediate[]>(
    detail.intermediateSteps.map(it => ({ ...it })),
  );
  const [levels, setLevels] = useState<EditLevel[]>(() => {
    const initialFlaskUl = (detail.final_volume_ml ?? 1) * 1000;
    return detail.levels.map(l => ({
      row_no: l.row_no, label: l.label, expected_note: l.expected_note,
      components: l.components.map(c => ({
        ...c, stock_mg_ml: deriveStockConc({ ...c, stock_mg_ml: null }, detail.intermediateSteps, initialFlaskUl),
      })),
    }));
  });
  const [summary, setSummary] = useState("");

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;

  /** Batch volume moved -- every component's draw is recomputed from its
   * (unchanged) target concentration and stock concentration against the
   * NEW flask size, same as if the whole set were re-planned at that size. */
  function changeBatchVolumeMl(v: string) {
    setBatchVolumeMl(v);
    const newFlaskUl = (Number(v) || 0) * 1000;
    setLevels(prev => prev.map(l => ({
      ...l,
      components: l.components.map(c => {
        const vol = volumeFromConc(c.concentration_mg_per_ml, c.stock_mg_ml, newFlaskUl);
        return vol != null ? { ...c, stock_volume_ul: vol } : c;
      }),
    })));
  }

  /** Target concentration is the thing being corrected -- recompute the
   * draw that reproduces it from this component's (unchanged) stock. */
  function changeComponentConc(li: number, ci: number, v: string) {
    setLevels(prev => prev.map((l, idx) => {
      if (idx !== li) return l;
      return {
        ...l, components: l.components.map((c, cidx) => {
          if (cidx !== ci) return c;
          const conc = numOrNull(v);
          const vol = volumeFromConc(conc, c.stock_mg_ml, batchUl);
          return { ...c, concentration_mg_per_ml: conc, stock_volume_ul: vol ?? c.stock_volume_ul };
        }),
      };
    }));
  }
  /** The draw itself is the correction (e.g. "I actually pipetted 55, not
   * 50") -- recompute what that draw achieves, not the other way around. */
  function changeComponentVolume(li: number, ci: number, v: string) {
    setLevels(prev => prev.map((l, idx) => {
      if (idx !== li) return l;
      return {
        ...l, components: l.components.map((c, cidx) => {
          if (cidx !== ci) return c;
          const vol = numOrNull(v);
          const conc = concFromVolume(vol, c.stock_mg_ml, batchUl);
          return { ...c, stock_volume_ul: vol, concentration_mg_per_ml: conc ?? c.concentration_mg_per_ml };
        }),
      };
    }));
  }
  /** The reference stock concentration was wrong -- target stays the
   * intent, the draw needed to hit it changes. */
  function changeComponentStockConc(li: number, ci: number, v: string) {
    setLevels(prev => prev.map((l, idx) => {
      if (idx !== li) return l;
      return {
        ...l, components: l.components.map((c, cidx) => {
          if (cidx !== ci) return c;
          const stockConc = numOrNull(v);
          const vol = volumeFromConc(c.concentration_mg_per_ml, stockConc, batchUl);
          return { ...c, stock_mg_ml: stockConc, stock_volume_ul: vol ?? c.stock_volume_ul };
        }),
      };
    }));
  }
  function changeComponentSourceLabel(li: number, ci: number, v: string) {
    setLevels(prev => prev.map((l, idx) => {
      if (idx !== li) return l;
      return { ...l, components: l.components.map((c, cidx) => (cidx === ci ? { ...c, source_label: v || null } : c)) };
    }));
  }
  function updateLevel(i: number, patch: Partial<EditLevel>) {
    setLevels(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeComponent(li: number, ci: number) {
    setLevels(prev => prev.map((l, idx) => (idx === li ? { ...l, components: l.components.filter((_c, cidx) => cidx !== ci) } : l)));
  }
  function removeLevel(li: number) {
    setLevels(prev => prev.filter((_l, idx) => idx !== li).map((l, idx) => ({ ...l, row_no: idx + 1 })));
  }
  function updateIntermediate(i: number, patch: Partial<EditIntermediate>) {
    setIntermediates(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeIntermediate(i: number) {
    setIntermediates(prev => prev.filter((_it, idx) => idx !== i));
  }

  function levelComponentsSumUl(l: EditLevel): number {
    return l.components.reduce((s, c) => s + (c.stock_volume_ul ?? 0), 0);
  }
  /** Never independently typed -- always flask_ul minus what the
   * components actually draw. Negative means overflow, not "0 diluent." */
  function levelDiluentUl(l: EditLevel): number {
    return batchUl - levelComponentsSumUl(l);
  }

  const overflowing = levels.some(l => levelDiluentUl(l) < -0.5);
  const canSubmit = summary.trim().length > 0 && standardName.trim().length > 0
    && levels.length > 0 && !overflowing && !saving;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Standard name</Label>
            <Input value={standardName} onChange={e => setStandardName(e.target.value)} />
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

      {intermediates.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Intermediate stocks</div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-[640px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1 pr-2">Label</th>
                  <th className="pb-1 pr-2">From</th>
                  <th className="pb-1 pr-2 text-right">Aliquot µL</th>
                  <th className="pb-1 pr-2 text-right">Diluent µL</th>
                  <th className="pb-1 pr-2 text-right">Total µL</th>
                  <th className="pb-1 pr-2 text-right">mg/mL</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {intermediates.map((it, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-2"><Input className="h-7 w-28 text-xs" value={it.label} onChange={e => updateIntermediate(i, { label: e.target.value })} /></td>
                    <td className="py-1 pr-2"><Input className="h-7 w-28 text-xs" value={it.source_label} onChange={e => updateIntermediate(i, { source_label: e.target.value })} /></td>
                    <td className="py-1 pr-2"><Input className="h-7 w-20 text-xs text-right" type="number" value={it.aliquot_ul ?? ""} onChange={e => updateIntermediate(i, { aliquot_ul: numOrNull(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Input className="h-7 w-20 text-xs text-right" type="number" value={it.diluent_ul ?? ""} onChange={e => updateIntermediate(i, { diluent_ul: numOrNull(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Input className="h-7 w-20 text-xs text-right" type="number" value={it.volume_ul ?? ""} onChange={e => updateIntermediate(i, { volume_ul: numOrNull(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Input className="h-7 w-20 text-xs text-right" type="number" step="0.001" value={it.concentration_mg_per_ml ?? ""} onChange={e => updateIntermediate(i, { concentration_mg_per_ml: numOrNull(e.target.value) })} /></td>
                    <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeIntermediate(i)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Levels</div>
        {levels.map((level, li) => {
          const sum = levelComponentsSumUl(level);
          const diluent = levelDiluentUl(level);
          const overflow = diluent < -0.5;
          return (
            <div key={li} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Input className="h-7 w-20 text-xs font-medium" value={level.label}
                  onChange={e => updateLevel(li, { label: e.target.value })} />
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] tabular-nums ${overflow ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                    {sum} + {overflow ? 0 : diluent} diluent = {overflow ? sum : batchUl} / {batchUl || "?"} µL
                    {overflow && ` -- overflows by ${Math.round(-diluent)} µL`}
                  </span>
                  <Button size="icon" variant="ghost" className="size-6" onClick={() => removeLevel(li)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 pr-2">Compound</th>
                    <th className="pb-1 pr-2">Target mg/mL</th>
                    <th className="pb-1 pr-2">Stock mg/mL</th>
                    <th className="pb-1 pr-2">Source</th>
                    <th className="pb-1 pr-2">µL</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {level.components.map((c, ci) => (
                    <tr key={ci} className="border-t border-border">
                      <td className="py-1 pr-2">{c.compound_name}</td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-20 text-xs" type="number" step="0.001"
                          value={c.concentration_mg_per_ml ?? ""}
                          onChange={e => changeComponentConc(li, ci, e.target.value)} />
                      </td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-20 text-xs" type="number" step="0.001"
                          value={c.stock_mg_ml ?? ""} placeholder="?"
                          onChange={e => changeComponentStockConc(li, ci, e.target.value)} />
                      </td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-28 text-xs" value={c.source_label ?? ""}
                          onChange={e => changeComponentSourceLabel(li, ci, e.target.value)} />
                      </td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-20 text-xs" type="number"
                          value={c.stock_volume_ul ?? ""}
                          onChange={e => changeComponentVolume(li, ci, e.target.value)} />
                      </td>
                      <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeComponent(li, ci)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="py-1 pr-2 text-muted-foreground">Diluent (computed)</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="py-1 pr-2 tabular-nums text-muted-foreground">{overflow ? "—" : diluent}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Type a new Target mg/mL and its draw recomputes from Stock mg/mL, grid-rounded to 5 µL -- or type a
          corrected draw directly and the concentration it actually achieves recomputes instead. Stock mg/mL
          starts back-derived from what was recorded (an intermediate's own concentration, or the primary math);
          correcting it also recomputes the draw. Diluent is never typed -- always flask minus what's drawn.
          Changing an intermediate's own concentration below does NOT cascade to components sourced from it.
          Adding a new compound or level isn't supported here -- that needs a stock concentration this record
          never captured. Existing values can be corrected or a level struck entirely.
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Why this range (goes on the printed cut sheet)</Label>
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)} />
      </Card>

      <Card className="p-4 space-y-2 border-amber-500/40">
        <Label className="text-xs">What changed and why (required)</Label>
        <Textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="e.g. L2 BPC/Cartalax were 0.35000000000000003 (float-noise bug), corrected to 0.35" />
        <p className="text-[11px] text-muted-foreground">
          Saving creates a new record (a new SYN-STDP number), linked back to {detail.log_number} -- this one
          stays exactly as it was prepared, and the correction is its own document, not a silent rewrite of it.
        </p>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!canSubmit}
          onClick={() => onSave({
            revised_from_id: detail.id,
            standard_name: standardName, diluent_name: diluentName,
            batch_volume_ml: Number(batchVolumeMl) || 1,
            range_reasoning: rangeReasoning || null,
            levels: levels.map(l => ({
              row_no: l.row_no, label: l.label, expected_note: l.expected_note,
              diluent_volume_ul: Math.max(0, roundToVolumeGrid(Math.max(0, levelDiluentUl(l)))),
              // abbrev and stock_mg_ml aren't persisted anywhere (create-time
              // scratch values only) -- abbrev re-derived from source_label,
              // same source of truth the run-list export already uses;
              // stock_mg_ml dropped, it was only ever this form's own
              // back-derived starting point for the recompute above.
              components: l.components.map(({ stock_mg_ml: _stock_mg_ml, ...c }) => ({
                ...c, abbrev: abbrevFor(c.compound_name, c.source_label),
              })),
            })),
            intermediate_steps: intermediates,
            summary: summary.trim(),
          })}
        >
          {saving ? "Saving..." : "Save as New Revision"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Full recipe correction for an already-submitted Standard Set / Standard
 * Prep Freelance record. Dustin, 2026-09-02: after a float-noise bug and an
 * overflow-math bug both reached printed cut sheets this session and had to
 * be hand-corrected in the database, "there is no way to edit or add notes
 * to an existing preparation" -- picked full recipe editing over notes-only.
 *
 * Edits the RECORDED values directly (concentration, stock volume, diluent
 * volume) rather than re-running the stock-planning calculator: the stock
 * concentration each level was actually drawn from was never persisted
 * (only the resulting draw was), so there's nothing to recompute FROM. This
 * is the same class of fix every correction this session actually was --
 * "this printed number is wrong, here's the right one" -- not "redesign
 * this compound's whole ladder."
 *
 * Deliberately does not support adding a new level or a new compound to an
 * existing prep: that would need a stock concentration this form has no
 * source for, and "add new material to an already-made vial" isn't really
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
import type { StandardSetDetail } from "@/lib/standard-preparations/standard-set.functions";
import { abbrevFor } from "@/lib/standard-preparations/standard-set-run-list";

interface EditComponent {
  compound_id: string | null;
  compound_name: string;
  concentration_mg_per_ml: number | null;
  stock_volume_ul: number | null;
  source_label: string | null;
}
interface EditLevel {
  row_no: number;
  label: string;
  components: EditComponent[];
  diluent_volume_ul: number | null;
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
  standard_name: string;
  diluent_name: string;
  batch_volume_ml: number;
  range_reasoning: string | null;
  levels: Array<{
    row_no: number;
    label: string;
    components: EditComponent[];
    diluent_volume_ul: number | null;
    expected_note: string | null;
  }>;
  intermediate_steps: EditIntermediate[];
  summary: string;
}

function numOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
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
  const [levels, setLevels] = useState<EditLevel[]>(detail.levels.map(l => ({
    row_no: l.row_no, label: l.label,
    components: l.components.map(c => ({ ...c })),
    diluent_volume_ul: l.diluent_volume_ul, expected_note: l.expected_note,
  })));
  const [intermediates, setIntermediates] = useState<EditIntermediate[]>(
    detail.intermediateSteps.map(it => ({ ...it })),
  );
  const [summary, setSummary] = useState("");

  const batchUl = (Number(batchVolumeMl) || 0) * 1000;

  function updateLevel(i: number, patch: Partial<EditLevel>) {
    setLevels(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function updateComponent(li: number, ci: number, patch: Partial<EditComponent>) {
    setLevels(prev => prev.map((l, idx) => {
      if (idx !== li) return l;
      return { ...l, components: l.components.map((c, cidx) => (cidx === ci ? { ...c, ...patch } : c)) };
    }));
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

  function levelSumUl(l: EditLevel): number {
    return l.components.reduce((s, c) => s + (c.stock_volume_ul ?? 0), 0) + (l.diluent_volume_ul ?? 0);
  }

  const canSubmit = summary.trim().length > 0 && standardName.trim().length > 0 && levels.length > 0 && !saving;

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
          const sum = levelSumUl(level);
          const balanced = batchUl > 0 && Math.abs(sum - batchUl) < 0.5;
          return (
            <div key={li} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Input className="h-7 w-20 text-xs font-medium" value={level.label}
                  onChange={e => updateLevel(li, { label: e.target.value })} />
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] tabular-nums ${balanced ? "text-muted-foreground" : "text-red-600 dark:text-red-400 font-medium"}`}>
                    {sum} / {batchUl || "?"} µL {balanced ? "" : "-- doesn't balance"}
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
                    <th className="pb-1 pr-2">mg/mL</th>
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
                          onChange={e => updateComponent(li, ci, { concentration_mg_per_ml: numOrNull(e.target.value) })} />
                      </td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-28 text-xs" value={c.source_label ?? ""}
                          onChange={e => updateComponent(li, ci, { source_label: e.target.value || null })} />
                      </td>
                      <td className="py-1 pr-2">
                        <Input className="h-7 w-20 text-xs" type="number"
                          value={c.stock_volume_ul ?? ""}
                          onChange={e => updateComponent(li, ci, { stock_volume_ul: numOrNull(e.target.value) })} />
                      </td>
                      <td><Button size="icon" variant="ghost" className="size-6" onClick={() => removeComponent(li, ci)}><Trash2 className="size-3.5 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="py-1 pr-2 text-muted-foreground">Diluent</td>
                    <td></td>
                    <td></td>
                    <td className="py-1 pr-2">
                      <Input className="h-7 w-20 text-xs" type="number"
                        value={level.diluent_volume_ul ?? ""}
                        onChange={e => updateLevel(li, { diluent_volume_ul: numOrNull(e.target.value) })} />
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Adding a new compound or level isn't supported here -- that needs a stock concentration this record
          never captured. Existing values can be corrected or a level struck entirely.
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Why this range (goes on the printed cut sheet)</Label>
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)} />
      </Card>

      {detail.editHistory.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Edit history</div>
          <div className="space-y-1.5">
            {detail.editHistory.map((h, i) => (
              <div key={i} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{new Date(h.at).toLocaleString()}</span>
                {" — "}{h.by}: {h.summary}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2 border-amber-500/40">
        <Label className="text-xs">What changed and why (required)</Label>
        <Textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="e.g. L2 BPC/Cartalax were 0.35000000000000003 (float-noise bug), corrected to 0.35" />
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!canSubmit}
          onClick={() => onSave({
            standard_name: standardName, diluent_name: diluentName,
            batch_volume_ml: Number(batchVolumeMl) || 1,
            range_reasoning: rangeReasoning || null,
            levels: levels.map(l => ({
              ...l,
              // abbrev isn't persisted anywhere (create-time only, used to
              // build source_label and then discarded) -- re-derived here
              // purely to satisfy componentSchema, same source of truth the
              // run-list export already uses for the real abbreviation.
              components: l.components.map(c => ({ ...c, abbrev: abbrevFor(c.compound_name, c.source_label) })),
            })),
            intermediate_steps: intermediates,
            summary: summary.trim(),
          })}
        >
          {saving ? "Saving..." : "Save Corrections"}
        </Button>
      </div>
    </div>
  );
}

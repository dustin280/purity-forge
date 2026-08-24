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
import { qk } from "@/lib/query-keys";

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

  function addCompound(id: string) {
    const c = allCompounds.find(x => x.id === id);
    if (!c) return;
    setCompounds(prev => [...prev, {
      compoundId: c.id, name: c.name, abbrev: defaultAbbrev(c.name),
      stockConcMgPerMl: 1,
    }]);
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
  function diluentUl(level: GridLevel): number {
    const used = compounds.reduce((sum, c) => sum + (stockUl(level, c) ?? 0), 0);
    return Math.max(0, batchUl - used);
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
        synId: detail.syn_id,
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
        {compounds.length === 0 && <div className="text-xs text-muted-foreground">Add at least one compound to build the grid.</div>}
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
                        className="h-7 w-20 text-xs" type="number" step="0.05"
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
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Why this range (goes on the printed cut sheet)</Label>
        <Textarea rows={3} value={rangeReasoning} onChange={e => setRangeReasoning(e.target.value)} placeholder="Floor/ceiling reasoning, budget checks, anything the next analyst should know." />
      </Card>

      <div className="flex justify-end">
        <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()}>
          <Download className="size-4 mr-1" /> {createMut.isPending ? "Saving…" : "Save & Download Cut Sheet"}
        </Button>
      </div>
    </div>
  );
}

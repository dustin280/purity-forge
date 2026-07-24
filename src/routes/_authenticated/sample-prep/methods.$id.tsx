import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, GitBranch, Save, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import {
  getMethod, getRevisionFull, updateRevision, setRevisionStatus, createRevisionFrom,
  saveMobilePhases, saveGradient, saveCalibration, savePrepRules,
  type MethodRevision, type GradientStep, type CalibrationLevel, type MobilePhase, type PrepRules,
} from "@/lib/sample-prep/master-data.functions";

export const Route = createFileRoute("/_authenticated/sample-prep/methods/$id")({
  head: () => ({ meta: [
    { title: "Method · Sample Prep" },
    { name: "description", content: "Edit method revisions, chromatography, gradient, calibration, and preparation rules." },
    { property: "og:title", content: "Method Editor" },
    { property: "og:description", content: "Sample-prep method editor." },
  ]}),
  component: MethodEditorPage,
});

function MethodEditorPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sp-method", id], queryFn: () => getMethod({ data: { id } }) });
  const revisions = data?.revisions ?? [];
  const [selectedRev, setSelectedRev] = useState<string | null>(null);
  useEffect(() => { if (!selectedRev && revisions.length) setSelectedRev(revisions[0].id); }, [revisions, selectedRev]);
  const currentRev = revisions.find(r => r.id === selectedRev);

  const cloneRev = useMutation({
    mutationFn: async (bump: "revision"|"version") => createRevisionFrom({ data: { from_id: selectedRev!, bump } }),
    onSuccess: (rev) => { toast.success("Revision drafted"); setSelectedRev(rev.id); qc.invalidateQueries({ queryKey: ["sp-method", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "draft"|"under_review"|"approved"|"retired") => setRevisionStatus({ data: { id: selectedRev!, status } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["sp-method", id] }); qc.invalidateQueries({ queryKey: ["sp-revision", selectedRev] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SamplePrepShell title={data?.method?.name ?? "Method"} description={data?.method ? `${data.method.code ?? "no code"} · ${data.method.method_type ?? "general"}` : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost"><Link to="/sample-prep/methods"><ArrowLeft className="size-4 mr-1" /> All methods</Link></Button>
        <div className="flex-1" />
        <Select value={selectedRev ?? ""} onValueChange={setSelectedRev}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Select revision" /></SelectTrigger>
          <SelectContent>
            {revisions.map(r => <SelectItem key={r.id} value={r.id}>v{r.version}.{r.revision} — {r.status}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={!selectedRev || cloneRev.isPending} onClick={() => cloneRev.mutate("revision")}><GitBranch className="size-4 mr-1" /> New revision</Button>
        <Button size="sm" variant="outline" disabled={!selectedRev || cloneRev.isPending} onClick={() => cloneRev.mutate("version")}><GitBranch className="size-4 mr-1" /> New version</Button>
        {currentRev && currentRev.status !== "approved" && (
          <Button size="sm" onClick={() => setStatus.mutate("approved")} disabled={setStatus.isPending}><CheckCircle2 className="size-4 mr-1" /> Approve</Button>
        )}
      </div>

      {currentRev && <RevisionEditor key={currentRev.id} revisionId={currentRev.id} status={currentRev.status} />}
    </SamplePrepShell>
  );
}

function RevisionEditor({ revisionId, status }: { revisionId: string; status: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sp-revision", revisionId], queryFn: () => getRevisionFull({ data: { id: revisionId } }) });
  const readOnly = status === "approved" || status === "superseded" || status === "retired";
  const [rev, setRev] = useState<MethodRevision | null>(null);
  const [mp, setMp] = useState<MobilePhase[]>([]);
  const [grad, setGrad] = useState<GradientStep[]>([]);
  const [cal, setCal] = useState<CalibrationLevel[]>([]);
  const [prep, setPrep] = useState<PrepRules | null>(null);

  useEffect(() => {
    if (data) {
      setRev(data.revision);
      setMp(data.mobile_phases);
      setGrad(data.gradient);
      setCal(data.calibration);
      setPrep(data.prep_rules);
    }
  }, [data]);

  const saveGeneral = useMutation({
    mutationFn: async () => {
      if (!rev) return;
      const patch = {
        instrument_type: rev.instrument_type, detector_type: rev.detector_type,
        reference_wavelength: rev.reference_wavelength, bandwidth: rev.bandwidth,
        flow_rate: rev.flow_rate, column_name: rev.column_name, column_manufacturer: rev.column_manufacturer,
        column_part_number: rev.column_part_number, stationary_phase: rev.stationary_phase,
        particle_size_um: rev.particle_size_um, column_dimensions: rev.column_dimensions,
        column_temp_c: rev.column_temp_c, autosampler_temp_c: rev.autosampler_temp_c,
        injection_volume_ul: rev.injection_volume_ul, needle_wash: rev.needle_wash, seal_wash: rev.seal_wash,
        total_run_time_min: rev.total_run_time_min, post_run_time_min: rev.post_run_time_min,
        estimated_rt_min: rev.estimated_rt_min, rt_window_min: rev.rt_window_min,
        expected_peak_order: rev.expected_peak_order, suitability_requirements: rev.suitability_requirements,
        notes: rev.notes, change_reason: rev.change_reason,
        wavelengths: Array.isArray(rev.wavelengths) ? rev.wavelengths.filter((n): n is number => typeof n === "number") : undefined,
      };
      await updateRevision({ data: { id: revisionId, patch } });
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["sp-revision", revisionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMp = useMutation({
    mutationFn: async () => saveMobilePhases({ data: { revision_id: revisionId, rows: mp.map(r => ({ channel: r.channel, composition_text: r.composition_text, initial_percent: r.initial_percent })) } }),
    onSuccess: () => { toast.success("Mobile phases saved"); qc.invalidateQueries({ queryKey: ["sp-revision", revisionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveGrad = useMutation({
    mutationFn: async () => saveGradient({ data: { revision_id: revisionId, steps: grad.map(s => ({ time_min: s.time_min, pct_a: s.pct_a, pct_b: s.pct_b, pct_c: s.pct_c, pct_d: s.pct_d, flow_rate: s.flow_rate, curve_type: s.curve_type })) } }),
    onSuccess: () => { toast.success("Gradient saved"); qc.invalidateQueries({ queryKey: ["sp-revision", revisionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveCal = useMutation({
    mutationFn: async () => saveCalibration({ data: { revision_id: revisionId, levels: cal.map(l => ({
      level_number: l.level_number, standard_name: l.standard_name, target_concentration: l.target_concentration,
      concentration_unit: l.concentration_unit, preparation_source: l.preparation_source, dilution_factor: l.dilution_factor,
      replicate_count: l.replicate_count, include_in_calibration: l.include_in_calibration,
      weighting_model: l.weighting_model, regression_model: l.regression_model,
      acceptance_notes: l.acceptance_notes, is_active: l.is_active,
    })) } }),
    onSuccess: () => { toast.success("Calibration saved"); qc.invalidateQueries({ queryKey: ["sp-revision", revisionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const savePrep = useMutation({
    mutationFn: async () => {
      if (!prep) return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { revision_id: _r, ...patch } = prep as unknown as Record<string, unknown>;
      await savePrepRules({ data: { revision_id: revisionId, patch: patch as never } });
    },
    onSuccess: () => { toast.success("Prep rules saved"); qc.invalidateQueries({ queryKey: ["sp-revision", revisionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const wavesText = useMemo(() => {
    if (!rev) return "";
    const w = rev.wavelengths;
    if (Array.isArray(w)) return w.join(", ");
    return "";
  }, [rev]);

  if (!rev) return <div className="text-sm text-muted-foreground">Loading revision…</div>;

  const disabled = readOnly;

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
        <Badge variant={status === "approved" ? "default" : "secondary"}>{status.replace("_", " ")}</Badge>
        {readOnly && <span>This revision is locked. Create a new revision or version to change it.</span>}
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="chromatography">Chromatography</TabsTrigger>
          <TabsTrigger value="gradient">Gradient</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          <TabsTrigger value="prep">Prep Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Instrument type"><Input disabled={disabled} value={rev.instrument_type ?? ""} onChange={e => setRev({ ...rev, instrument_type: e.target.value })} placeholder="HPLC-DAD, LC-MS…" /></F>
              <F label="Detector"><Input disabled={disabled} value={rev.detector_type ?? ""} onChange={e => setRev({ ...rev, detector_type: e.target.value })} /></F>
              <F label="Wavelengths (comma-separated nm)"><Input disabled={disabled} defaultValue={wavesText} onBlur={e => setRev({ ...rev, wavelengths: e.target.value.split(",").map(s => Number(s.trim())).filter(n => !Number.isNaN(n)) })} /></F>
              <F label="Reference λ (nm)"><Input disabled={disabled} type="number" value={rev.reference_wavelength ?? ""} onChange={e => setRev({ ...rev, reference_wavelength: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Total run time (min)"><Input disabled={disabled} type="number" step="any" value={rev.total_run_time_min ?? ""} onChange={e => setRev({ ...rev, total_run_time_min: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Post-run (min)"><Input disabled={disabled} type="number" step="any" value={rev.post_run_time_min ?? ""} onChange={e => setRev({ ...rev, post_run_time_min: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Estimated RT (min)"><Input disabled={disabled} type="number" step="any" value={rev.estimated_rt_min ?? ""} onChange={e => setRev({ ...rev, estimated_rt_min: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="RT window (min)"><Input disabled={disabled} type="number" step="any" value={rev.rt_window_min ?? ""} onChange={e => setRev({ ...rev, rt_window_min: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Expected peak order" wide><Input disabled={disabled} value={rev.expected_peak_order ?? ""} onChange={e => setRev({ ...rev, expected_peak_order: e.target.value })} /></F>
              <F label="System suitability" wide><Textarea disabled={disabled} value={rev.suitability_requirements ?? ""} onChange={e => setRev({ ...rev, suitability_requirements: e.target.value })} rows={2} /></F>
              <F label="Change reason" wide><Textarea disabled={disabled} value={rev.change_reason ?? ""} onChange={e => setRev({ ...rev, change_reason: e.target.value })} rows={2} /></F>
              <F label="Notes" wide><Textarea disabled={disabled} value={rev.notes ?? ""} onChange={e => setRev({ ...rev, notes: e.target.value })} rows={2} /></F>
            </div>
            <div className="flex justify-end"><Button disabled={disabled || saveGeneral.isPending} onClick={() => saveGeneral.mutate()}><Save className="size-4 mr-1" /> Save</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="chromatography">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Column name"><Input disabled={disabled} value={rev.column_name ?? ""} onChange={e => setRev({ ...rev, column_name: e.target.value })} /></F>
              <F label="Manufacturer"><Input disabled={disabled} value={rev.column_manufacturer ?? ""} onChange={e => setRev({ ...rev, column_manufacturer: e.target.value })} /></F>
              <F label="Part number"><Input disabled={disabled} value={rev.column_part_number ?? ""} onChange={e => setRev({ ...rev, column_part_number: e.target.value })} /></F>
              <F label="Stationary phase"><Input disabled={disabled} value={rev.stationary_phase ?? ""} onChange={e => setRev({ ...rev, stationary_phase: e.target.value })} /></F>
              <F label="Particle size (µm)"><Input disabled={disabled} type="number" step="any" value={rev.particle_size_um ?? ""} onChange={e => setRev({ ...rev, particle_size_um: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Dimensions"><Input disabled={disabled} value={rev.column_dimensions ?? ""} onChange={e => setRev({ ...rev, column_dimensions: e.target.value })} placeholder="150 × 4.6 mm" /></F>
              <F label="Column temp (°C)"><Input disabled={disabled} type="number" step="any" value={rev.column_temp_c ?? ""} onChange={e => setRev({ ...rev, column_temp_c: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Autosampler temp (°C)"><Input disabled={disabled} type="number" step="any" value={rev.autosampler_temp_c ?? ""} onChange={e => setRev({ ...rev, autosampler_temp_c: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Injection volume (µL)"><Input disabled={disabled} type="number" step="any" value={rev.injection_volume_ul ?? ""} onChange={e => setRev({ ...rev, injection_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Flow rate (mL/min)"><Input disabled={disabled} type="number" step="any" value={rev.flow_rate ?? ""} onChange={e => setRev({ ...rev, flow_rate: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Needle wash"><Input disabled={disabled} value={rev.needle_wash ?? ""} onChange={e => setRev({ ...rev, needle_wash: e.target.value })} /></F>
              <F label="Seal wash"><Input disabled={disabled} value={rev.seal_wash ?? ""} onChange={e => setRev({ ...rev, seal_wash: e.target.value })} /></F>
            </div>

            <div className="pt-3 border-t space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Mobile phase channels</Label>
                {!disabled && (
                  <Select onValueChange={(v) => { if (mp.some(m => m.channel === v)) return; setMp([...mp, { id: `new-${v}`, revision_id: revisionId, channel: v as MobilePhase["channel"], composition_text: "", initial_percent: null }]); }}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="+ Add channel" /></SelectTrigger>
                    <SelectContent>{["A","B","C","D"].map(c => <SelectItem key={c} value={c}>Channel {c}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                {mp.map((m, i) => (
                  <div key={m.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 text-sm font-medium">{m.channel}</div>
                    <Input disabled={disabled} className="col-span-8" placeholder="Composition (e.g. 0.1% TFA in water)" value={m.composition_text ?? ""} onChange={e => setMp(mp.map((x, j) => j === i ? { ...x, composition_text: e.target.value } : x))} />
                    <Input disabled={disabled} className="col-span-2" type="number" step="any" placeholder="init %" value={m.initial_percent ?? ""} onChange={e => setMp(mp.map((x, j) => j === i ? { ...x, initial_percent: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                    <Button disabled={disabled} className="col-span-1" size="sm" variant="ghost" onClick={() => setMp(mp.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button disabled={disabled || saveMp.isPending} variant="outline" onClick={() => saveMp.mutate()}>Save channels</Button>
              <Button disabled={disabled || saveGeneral.isPending} onClick={() => saveGeneral.mutate()}><Save className="size-4 mr-1" /> Save chromatography</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="gradient">
          <Card className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs">Gradient program</Label>
              {!disabled && <Button size="sm" variant="outline" onClick={() => setGrad([...grad, { id: `new-${grad.length}`, revision_id: revisionId, ordinal: grad.length + 1, time_min: null, pct_a: null, pct_b: null, pct_c: null, pct_d: null, flow_rate: null, curve_type: null }])}><Plus className="size-3 mr-1" /> Add step</Button>}
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Time (min)</TableHead><TableHead>%A</TableHead><TableHead>%B</TableHead><TableHead>%C</TableHead><TableHead>%D</TableHead><TableHead>Flow</TableHead><TableHead>Curve</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {grad.map((g, i) => (
                    <TableRow key={g.id}>
                      <TableCell>{i + 1}</TableCell>
                      {(["time_min","pct_a","pct_b","pct_c","pct_d","flow_rate"] as const).map(k => (
                        <TableCell key={k}><Input disabled={disabled} type="number" step="any" className="w-20" value={g[k] ?? ""} onChange={e => setGrad(grad.map((x, j) => j === i ? { ...x, [k]: e.target.value === "" ? null : Number(e.target.value) } : x))} /></TableCell>
                      ))}
                      <TableCell><Input disabled={disabled} className="w-24" value={g.curve_type ?? ""} onChange={e => setGrad(grad.map((x, j) => j === i ? { ...x, curve_type: e.target.value || null } : x))} /></TableCell>
                      <TableCell><Button disabled={disabled} size="sm" variant="ghost" onClick={() => setGrad(grad.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {!grad.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">No gradient steps.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end"><Button disabled={disabled || saveGrad.isPending} onClick={() => saveGrad.mutate()}><Save className="size-4 mr-1" /> Save gradient</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="calibration">
          <Card className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs">Calibration levels (max 20)</Label>
              {!disabled && <Button size="sm" variant="outline" disabled={cal.length >= 20} onClick={() => setCal([...cal, { id: `new-${cal.length}`, revision_id: revisionId, level_number: cal.length + 1, standard_name: `Level ${cal.length + 1}`, target_concentration: null, concentration_unit: null, preparation_source: null, dilution_factor: null, replicate_count: null, include_in_calibration: true, weighting_model: null, regression_model: null, acceptance_notes: null, is_active: true }])}><Plus className="size-3 mr-1" /> Add level</Button>}
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Lvl</TableHead><TableHead>Name</TableHead><TableHead>Target conc</TableHead><TableHead>Unit</TableHead><TableHead>Source</TableHead><TableHead>Dil. factor</TableHead><TableHead>Reps</TableHead><TableHead>In cal</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {cal.map((l, i) => (
                    <TableRow key={l.id}>
                      <TableCell><Input disabled={disabled} type="number" className="w-14" value={l.level_number} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, level_number: Number(e.target.value) } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} className="w-32" value={l.standard_name ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, standard_name: e.target.value } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} type="number" step="any" className="w-24" value={l.target_concentration ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, target_concentration: e.target.value === "" ? null : Number(e.target.value) } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} className="w-20" value={l.concentration_unit ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, concentration_unit: e.target.value } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} className="w-32" value={l.preparation_source ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, preparation_source: e.target.value } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} type="number" step="any" className="w-20" value={l.dilution_factor ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, dilution_factor: e.target.value === "" ? null : Number(e.target.value) } : x))} /></TableCell>
                      <TableCell><Input disabled={disabled} type="number" className="w-16" value={l.replicate_count ?? ""} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, replicate_count: e.target.value === "" ? null : Number(e.target.value) } : x))} /></TableCell>
                      <TableCell><input disabled={disabled} type="checkbox" checked={l.include_in_calibration} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, include_in_calibration: e.target.checked } : x))} /></TableCell>
                      <TableCell><input disabled={disabled} type="checkbox" checked={l.is_active} onChange={e => setCal(cal.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} /></TableCell>
                      <TableCell><Button disabled={disabled} size="sm" variant="ghost" onClick={() => setCal(cal.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end"><Button disabled={disabled || saveCal.isPending} onClick={() => saveCal.mutate()}><Save className="size-4 mr-1" /> Save calibration</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="prep">
          <Card className="p-4 space-y-3">
            {prep ? (
              <div className="grid grid-cols-2 gap-3">
                <F label="Default target level"><Input disabled={disabled} type="number" value={prep.default_target_level ?? 3} onChange={e => setPrep({ ...prep, default_target_level: Number(e.target.value) })} /></F>
                <F label="Default stock concentration"><Input disabled={disabled} type="number" step="any" value={prep.default_stock_concentration ?? ""} onChange={e => setPrep({ ...prep, default_stock_concentration: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Stock concentration unit"><Input disabled={disabled} value={prep.default_stock_concentration_unit ?? ""} onChange={e => setPrep({ ...prep, default_stock_concentration_unit: e.target.value })} placeholder="mg/mL" /></F>
                <F label="Max dilution steps"><Input disabled={disabled} type="number" value={prep.max_dilution_steps ?? ""} onChange={e => setPrep({ ...prep, max_dilution_steps: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Preferred initial recon volume (µL)"><Input disabled={disabled} type="number" step="any" value={prep.preferred_initial_reconstitution_volume_ul ?? ""} onChange={e => setPrep({ ...prep, preferred_initial_reconstitution_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Preferred final volume (µL)"><Input disabled={disabled} type="number" step="any" value={prep.preferred_final_volume_ul ?? ""} onChange={e => setPrep({ ...prep, preferred_final_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Min pipette (µL)"><Input disabled={disabled} type="number" step="any" value={prep.min_pipette_volume_ul ?? ""} onChange={e => setPrep({ ...prep, min_pipette_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Preferred min pipette (µL)"><Input disabled={disabled} type="number" step="any" value={prep.preferred_min_pipette_volume_ul ?? ""} onChange={e => setPrep({ ...prep, preferred_min_pipette_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Max pipette (µL)"><Input disabled={disabled} type="number" step="any" value={prep.max_pipette_volume_ul ?? ""} onChange={e => setPrep({ ...prep, max_pipette_volume_ul: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Max concentration deviation (%)"><Input disabled={disabled} type="number" step="any" value={prep.max_concentration_deviation_pct ?? ""} onChange={e => setPrep({ ...prep, max_concentration_deviation_pct: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <div className="col-span-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input disabled={disabled} type="checkbox" checked={prep.allow_direct} onChange={e => setPrep({ ...prep, allow_direct: e.target.checked })} /> Allow direct</label>
                  <label className="flex items-center gap-1.5"><input disabled={disabled} type="checkbox" checked={prep.allow_serial} onChange={e => setPrep({ ...prep, allow_serial: e.target.checked })} /> Allow serial</label>
                  <label className="flex items-center gap-1.5"><input disabled={disabled} type="checkbox" checked={prep.allow_gravimetric} onChange={e => setPrep({ ...prep, allow_gravimetric: e.target.checked })} /> Gravimetric</label>
                  <label className="flex items-center gap-1.5"><input disabled={disabled} type="checkbox" checked={prep.allow_volumetric} onChange={e => setPrep({ ...prep, allow_volumetric: e.target.checked })} /> Volumetric</label>
                </div>
                <F label="Mixing instructions" wide><Textarea disabled={disabled} value={prep.mixing_instructions ?? ""} onChange={e => setPrep({ ...prep, mixing_instructions: e.target.value })} rows={2} /></F>
                <F label="Sonication" wide><Textarea disabled={disabled} value={prep.sonication_instructions ?? ""} onChange={e => setPrep({ ...prep, sonication_instructions: e.target.value })} rows={2} /></F>
                <F label="Centrifugation" wide><Textarea disabled={disabled} value={prep.centrifugation_instructions ?? ""} onChange={e => setPrep({ ...prep, centrifugation_instructions: e.target.value })} rows={2} /></F>
                <F label="Filtration" wide><Textarea disabled={disabled} value={prep.filtration_instructions ?? ""} onChange={e => setPrep({ ...prep, filtration_instructions: e.target.value })} rows={2} /></F>
                <F label="Filter type"><Input disabled={disabled} value={prep.filter_type ?? ""} onChange={e => setPrep({ ...prep, filter_type: e.target.value })} /></F>
                <F label="Filter pore (µm)"><Input disabled={disabled} type="number" step="any" value={prep.filter_pore_um ?? ""} onChange={e => setPrep({ ...prep, filter_pore_um: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Storage temp (°C)"><Input disabled={disabled} type="number" step="any" value={prep.storage_temp_c ?? ""} onChange={e => setPrep({ ...prep, storage_temp_c: e.target.value === "" ? null : Number(e.target.value) })} /></F>
                <F label="Max hold time"><Input disabled={disabled} value={prep.max_hold_time ?? ""} onChange={e => setPrep({ ...prep, max_hold_time: e.target.value })} placeholder="24h, 7d…" /></F>
                <F label="Stability notes" wide><Textarea disabled={disabled} value={prep.stability_notes ?? ""} onChange={e => setPrep({ ...prep, stability_notes: e.target.value })} rows={2} /></F>
                <F label="Special handling" wide><Textarea disabled={disabled} value={prep.special_handling ?? ""} onChange={e => setPrep({ ...prep, special_handling: e.target.value })} rows={2} /></F>
                <F label="Safety notes" wide><Textarea disabled={disabled} value={prep.safety_notes ?? ""} onChange={e => setPrep({ ...prep, safety_notes: e.target.value })} rows={2} /></F>
              </div>
            ) : <div className="text-sm text-muted-foreground">Loading prep rules…</div>}
            <div className="flex justify-end"><Button disabled={disabled || savePrep.isPending} onClick={() => savePrep.mutate()}><Save className="size-4 mr-1" /> Save prep rules</Button></div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function F({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={(wide ? "col-span-2 " : "") + "space-y-1"}><Label className="text-xs">{label}</Label>{children}</div>;
}
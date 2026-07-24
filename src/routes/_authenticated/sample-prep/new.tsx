import { useEffect, useMemo, useReducer } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SamplePrepShell } from "@/components/sample-prep/section-nav";
import {
  getPrepSettings,
  getRevisionFull,
  listEquipment,
  listMethods,
  listSolventFormulations,
  listVessels,
  type CalibrationLevel,
  type MethodRevision,
  type PrepRules,
} from "@/lib/sample-prep/master-data.functions";
import { planPreparation, formatConcentration, formatVolume, type PrepPlan } from "@/lib/sample-prep/prep-engine";

export const Route = createFileRoute("/_authenticated/sample-prep/new")({
  head: () => ({ meta: [
    { title: "New Preparation · Sample Prep" },
    { name: "description", content: "Method-driven preparation wizard: pick a method, describe the source, target a calibration level, and generate a bench-ready prep plan." },
    { property: "og:title", content: "New Preparation" },
    { property: "og:description", content: "Guided sample preparation planner." },
  ]}),
  component: NewPrepWizard,
});

// ---------------- State ----------------

type SourceForm = "lyophilized" | "solution";

interface WizardState {
  step: number;
  revisionId: string | null;
  sampleId: string;
  lotNumber: string;
  sourceForm: SourceForm;
  availableMassMg: string;
  purityPercent: string;
  stockConcMgPerMl: string;
  availableVolumeUl: string;
  reconstitutionVolumeUl: string;
  solventName: string;
  targetLevel: number | null;
  targetConcMgPerMl: string;
  finalVolumeUl: string;
  notes: string;
}

const emptyState: WizardState = {
  step: 0,
  revisionId: null,
  sampleId: "",
  lotNumber: "",
  sourceForm: "lyophilized",
  availableMassMg: "",
  purityPercent: "",
  stockConcMgPerMl: "",
  availableVolumeUl: "",
  reconstitutionVolumeUl: "",
  solventName: "",
  targetLevel: null,
  targetConcMgPerMl: "",
  finalVolumeUl: "",
  notes: "",
};

type Action =
  | { type: "set"; patch: Partial<WizardState> }
  | { type: "step"; delta: 1 | -1 }
  | { type: "goto"; step: number }
  | { type: "reset" };

function reducer(s: WizardState, a: Action): WizardState {
  switch (a.type) {
    case "set": return { ...s, ...a.patch };
    case "step": return { ...s, step: Math.max(0, Math.min(4, s.step + a.delta)) };
    case "goto": return { ...s, step: a.step };
    case "reset": return { ...emptyState };
  }
}

const DRAFT_KEY = "sp-wizard-draft-v1";

function loadDraft(): WizardState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyState;
    return { ...emptyState, ...(JSON.parse(raw) as Partial<WizardState>) };
  } catch { return emptyState; }
}

// ---------------- Component ----------------

const STEP_TITLES = ["Method", "Sample", "Target", "Solvent & Vessels", "Review"];

function NewPrepWizard() {
  const [state, dispatch] = useReducer(reducer, undefined, loadDraft);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const methodsQ = useQuery({ queryKey: ["sp-methods"], queryFn: () => listMethods() });
  const settingsQ = useQuery({ queryKey: ["sp-settings"], queryFn: () => getPrepSettings() });
  const vesselsQ = useQuery({ queryKey: ["sp-vessels"], queryFn: () => listVessels() });
  const equipmentQ = useQuery({ queryKey: ["sp-equipment"], queryFn: () => listEquipment() });
  const solventsQ = useQuery({ queryKey: ["sp-solvents"], queryFn: () => listSolventFormulations() });
  const revisionQ = useQuery({
    queryKey: ["sp-rev-full", state.revisionId],
    queryFn: () => getRevisionFull({ data: { id: state.revisionId! } }),
    enabled: !!state.revisionId,
  });

  const approvedRevisions = useMemo(() => {
    if (!methodsQ.data) return [] as Array<{ method: { id: string; name: string; analyte_id: string }; revision: Partial<MethodRevision> & { id: string; method_id: string } }>;
    const methodById = new Map(methodsQ.data.methods.map(m => [m.id, m]));
    return methodsQ.data.revisions
      .filter(r => r.status === "approved" && methodById.get(r.method_id))
      .map(r => ({ method: methodById.get(r.method_id)!, revision: r }));
  }, [methodsQ.data]);

  const rev = revisionQ.data?.revision ?? null;
  const rules = revisionQ.data?.prep_rules ?? null;
  const calibration = revisionQ.data?.calibration ?? [];
  const activeLevels = calibration.filter(l => l.is_active !== false && l.target_concentration != null);
  const selectedLevel = state.targetLevel != null ? activeLevels.find(l => l.level_number === state.targetLevel) ?? null : null;

  // Prefill target from level.
  useEffect(() => {
    if (!selectedLevel) return;
    const conc = normalizeToMgPerMl(selectedLevel.target_concentration, selectedLevel.concentration_unit);
    if (conc != null && !state.targetConcMgPerMl) {
      dispatch({ type: "set", patch: { targetConcMgPerMl: String(conc) } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.targetLevel]);

  // Prefill defaults from rules once loaded.
  useEffect(() => {
    if (!rules) return;
    const patch: Partial<WizardState> = {};
    if (!state.reconstitutionVolumeUl && rules.preferred_initial_reconstitution_volume_ul) {
      patch.reconstitutionVolumeUl = String(rules.preferred_initial_reconstitution_volume_ul);
    }
    if (!state.finalVolumeUl && rules.preferred_final_volume_ul) {
      patch.finalVolumeUl = String(rules.preferred_final_volume_ul);
    }
    if (state.targetLevel == null && rules.default_target_level) {
      patch.targetLevel = rules.default_target_level;
    }
    if (Object.keys(patch).length) dispatch({ type: "set", patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules?.revision_id]);

  const plan: PrepPlan | null = useMemo(() => {
    if (!rev || !rules) return null;
    const targetConc = Number(state.targetConcMgPerMl);
    const finalVol = Number(state.finalVolumeUl);
    if (!(targetConc > 0) || !(finalVol > 0)) return null;
    const purityFraction = state.purityPercent ? Number(state.purityPercent) / 100 : 1;
    const calRange = activeLevels
      .map(l => normalizeToMgPerMl(l.target_concentration, l.concentration_unit))
      .filter((n): n is number => n != null);
    return planPreparation({
      analyteName: methodsQ.data?.analytes.find(a => a.id === methodsQ.data?.methods.find(m => m.id === rev.method_id)?.analyte_id)?.canonical_name ?? "analyte",
      source: {
        form: state.sourceForm,
        availableMassMg: state.availableMassMg ? Number(state.availableMassMg) : null,
        purityFraction,
        stockConcentrationMgPerMl: state.stockConcMgPerMl ? Number(state.stockConcMgPerMl) : null,
        availableVolumeUl: state.availableVolumeUl ? Number(state.availableVolumeUl) : null,
      },
      reconstitution: {
        volumeUl: state.reconstitutionVolumeUl ? Number(state.reconstitutionVolumeUl) : null,
        solventName: state.solventName || "diluent",
      },
      target: {
        concentrationMgPerMl: targetConc,
        finalVolumeUl: finalVol,
        calibrationLevel: state.targetLevel,
      },
      rules: {
        absoluteMinPipetteUl: rules.min_pipette_volume_ul ?? settingsQ.data?.absolute_min_pipette_ul ?? 10,
        preferredMinPipetteUl: rules.preferred_min_pipette_volume_ul ?? settingsQ.data?.preferred_min_pipette_ul ?? 20,
        maxPipetteUl: rules.max_pipette_volume_ul ?? null,
        maxDilutionSteps: rules.max_dilution_steps ?? settingsQ.data?.max_dilution_steps ?? 5,
        preferredFinalVolumeUl: rules.preferred_final_volume_ul,
        minInitialReconstitutionUl: rules.min_initial_reconstitution_volume_ul,
        maxInitialReconstitutionUl: rules.max_initial_reconstitution_volume_ul,
        preferredInitialReconstitutionUl: rules.preferred_initial_reconstitution_volume_ul,
      },
      calibration: calRange.length
        ? { minMgPerMl: Math.min(...calRange), maxMgPerMl: Math.max(...calRange) }
        : undefined,
      vessels: vesselsQ.data?.map(v => ({
        id: v.id, name: v.name, nominalCapacityUl: v.nominal_capacity_ul,
        minWorkingUl: v.min_working_volume_ul, maxWorkingUl: v.max_working_volume_ul,
      })),
      equipment: equipmentQ.data?.map(e => ({
        id: e.id,
        label: [e.manufacturer, e.model, e.equipment_id].filter(Boolean).join(" ") || e.equipment_type,
        equipmentType: e.equipment_type,
        minCapacity: e.min_capacity,
        maxCapacity: e.max_capacity,
        capacityUnit: e.capacity_unit,
      })),
    });
  }, [state, rev, rules, activeLevels, methodsQ.data, settingsQ.data, vesselsQ.data, equipmentQ.data]);

  const canAdvance = validate(state.step, state, rev, rules);

  return (
    <SamplePrepShell title="New Preparation" description="Turn an approved method revision into a bench-ready preparation plan.">
      <Stepper current={state.step} onGoto={n => dispatch({ type: "goto", step: n })} />

      {state.step === 0 && (
        <StepMethod
          revisions={approvedRevisions}
          selectedId={state.revisionId}
          onSelect={id => dispatch({ type: "set", patch: { revisionId: id } })}
          loading={methodsQ.isLoading}
        />
      )}

      {state.step === 1 && (
        <StepSample state={state} dispatch={dispatch} />
      )}

      {state.step === 2 && (
        <StepTarget
          state={state}
          dispatch={dispatch}
          levels={activeLevels}
          rules={rules}
        />
      )}

      {state.step === 3 && (
        <StepSolventVessels
          state={state}
          dispatch={dispatch}
          solventNames={solventsQ.data?.formulations.filter(f => f.status === "approved").map(f => f.name) ?? []}
        />
      )}

      {state.step === 4 && (
        <StepReview
          state={state}
          rev={rev}
          rules={rules}
          plan={plan}
          vessels={vesselsQ.data ?? []}
          equipment={equipmentQ.data ?? []}
        />
      )}

      <div className="flex items-center justify-between print:hidden pt-2">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: "step", delta: -1 })} disabled={state.step === 0}>
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <Button type="button" variant="ghost" onClick={() => { if (confirm("Discard draft and start fresh?")) dispatch({ type: "reset" }); }}>
            Reset
          </Button>
        </div>
        <div className="flex gap-2">
          {state.step < 4 && (
            <Button type="button" onClick={() => dispatch({ type: "step", delta: 1 })} disabled={!canAdvance}>
              Next <ArrowRight className="size-4 ml-1" />
            </Button>
          )}
          {state.step === 4 && (
            <Button type="button" onClick={() => window.print()} disabled={!plan?.ok}>
              <Printer className="size-4 mr-1" /> Print prep sheet
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        Persistence, review workflow, and lot capture arrive in Phase 1C. Meanwhile use{" "}
        <Link to="/sample-prep/quick-dilution" className="underline">Quick Dilution</Link> for ad-hoc calcs.
      </p>
    </SamplePrepShell>
  );
}

// ---------------- Steps ----------------

function Stepper({ current, onGoto }: { current: number; onGoto: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {STEP_TITLES.map((t, i) => (
        <button
          key={t}
          type="button"
          onClick={() => onGoto(i)}
          className="flex items-center gap-2"
        >
          <span className={`size-7 rounded-full text-xs flex items-center justify-center border ${
            i === current ? "bg-primary text-primary-foreground border-primary"
            : i < current ? "bg-primary/20 border-primary/40"
            : "bg-muted"
          }`}>
            {i < current ? <CheckCircle2 className="size-4" /> : i + 1}
          </span>
          <span className={`text-sm ${i === current ? "font-semibold" : "text-muted-foreground"}`}>{t}</span>
          {i < STEP_TITLES.length - 1 && <span className="w-6 h-px bg-border mx-1" />}
        </button>
      ))}
    </div>
  );
}

function StepMethod({
  revisions, selectedId, onSelect, loading,
}: {
  revisions: Array<{ method: { id: string; name: string; analyte_id: string }; revision: Partial<MethodRevision> & { id: string } }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-lg font-medium">Choose an approved method revision</h2>
      {loading && <p className="text-sm text-muted-foreground">Loading methods…</p>}
      {!loading && revisions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No approved method revisions yet. Go to <Link to="/sample-prep/methods" className="underline">Methods</Link> to approve one.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {revisions.map(({ method, revision }) => (
          <button
            key={revision.id}
            type="button"
            onClick={() => onSelect(revision.id)}
            className={`text-left rounded-md border p-3 hover:border-primary transition-colors ${selectedId === revision.id ? "border-primary bg-primary/5" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{method.name}</div>
                <div className="text-xs text-muted-foreground">
                  v{revision.version ?? 1}.{revision.revision ?? 0}
                  {revision.column_name ? ` · ${revision.column_name}` : ""}
                </div>
              </div>
              <Badge variant="secondary">approved</Badge>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function StepSample({ state, dispatch }: { state: WizardState; dispatch: React.Dispatch<Action> }) {
  const set = (patch: Partial<WizardState>) => dispatch({ type: "set", patch });
  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-lg font-medium">Sample & source material</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="sample-id">Sample ID (optional)</Label>
          <Input id="sample-id" value={state.sampleId} onChange={e => set({ sampleId: e.target.value })} placeholder="SYX-…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lot">Lot number</Label>
          <Input id="lot" value={state.lotNumber} onChange={e => set({ lotNumber: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Source form</Label>
        <RadioGroup value={state.sourceForm} onValueChange={v => set({ sourceForm: v as SourceForm })} className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="lyophilized" /> Lyophilized solid</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="solution" /> Prepared solution</label>
        </RadioGroup>
      </div>
      {state.sourceForm === "lyophilized" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mass">Mass on hand (mg)</Label>
            <Input id="mass" type="number" inputMode="decimal" value={state.availableMassMg} onChange={e => set({ availableMassMg: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="purity">Purity (%) — optional</Label>
            <Input id="purity" type="number" inputMode="decimal" value={state.purityPercent} onChange={e => set({ purityPercent: e.target.value })} placeholder="100" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="stock">Stock concentration (mg/mL)</Label>
            <Input id="stock" type="number" inputMode="decimal" value={state.stockConcMgPerMl} onChange={e => set({ stockConcMgPerMl: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vol">Volume on hand (µL)</Label>
            <Input id="vol" type="number" inputMode="decimal" value={state.availableVolumeUl} onChange={e => set({ availableVolumeUl: e.target.value })} />
          </div>
        </div>
      )}
    </Card>
  );
}

function StepTarget({
  state, dispatch, levels, rules,
}: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  levels: CalibrationLevel[];
  rules: PrepRules | null;
}) {
  const set = (patch: Partial<WizardState>) => dispatch({ type: "set", patch });
  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-lg font-medium">Target concentration</h2>
      {levels.length > 0 && (
        <div className="space-y-1">
          <Label>Calibration level</Label>
          <Select
            value={state.targetLevel != null ? String(state.targetLevel) : "custom"}
            onValueChange={v => {
              if (v === "custom") set({ targetLevel: null });
              else {
                const n = Number(v);
                const lvl = levels.find(l => l.level_number === n);
                const conc = normalizeToMgPerMl(lvl?.target_concentration ?? null, lvl?.concentration_unit ?? null);
                set({ targetLevel: n, targetConcMgPerMl: conc != null ? String(conc) : state.targetConcMgPerMl });
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Choose a level" /></SelectTrigger>
            <SelectContent>
              {levels.map(l => (
                <SelectItem key={l.id} value={String(l.level_number)}>
                  Level {l.level_number} — {l.standard_name ?? "—"} · {l.target_concentration} {l.concentration_unit ?? ""}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom (not a calibration level)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="tconc">Target concentration (mg/mL)</Label>
          <Input id="tconc" type="number" inputMode="decimal" value={state.targetConcMgPerMl} onChange={e => set({ targetConcMgPerMl: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fvol">Final volume (µL)</Label>
          <Input id="fvol" type="number" inputMode="decimal" value={state.finalVolumeUl} onChange={e => set({ finalVolumeUl: e.target.value })} placeholder={rules?.preferred_final_volume_ul ? `preferred ${rules.preferred_final_volume_ul}` : ""} />
        </div>
      </div>
    </Card>
  );
}

function StepSolventVessels({
  state, dispatch, solventNames,
}: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  solventNames: string[];
}) {
  const set = (patch: Partial<WizardState>) => dispatch({ type: "set", patch });
  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-lg font-medium">Diluent & reconstitution</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="solvent">Diluent / solvent</Label>
          <Input
            id="solvent"
            value={state.solventName}
            onChange={e => set({ solventName: e.target.value })}
            list="sp-solvent-suggestions"
            placeholder="e.g. 50% ACN in water"
          />
          <datalist id="sp-solvent-suggestions">
            {solventNames.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>
        {state.sourceForm === "lyophilized" && (
          <div className="space-y-1">
            <Label htmlFor="rvol">Reconstitution volume (µL)</Label>
            <Input id="rvol" type="number" inputMode="decimal" value={state.reconstitutionVolumeUl} onChange={e => set({ reconstitutionVolumeUl: e.target.value })} />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" value={state.notes} onChange={e => set({ notes: e.target.value })} rows={3} />
      </div>
    </Card>
  );
}

function StepReview({
  state, rev, rules, plan, vessels, equipment,
}: {
  state: WizardState;
  rev: MethodRevision | null;
  rules: PrepRules | null;
  plan: PrepPlan | null;
  vessels: Array<{ id: string; name: string }>;
  equipment: Array<{ id: string; equipment_type: string; manufacturer: string | null; model: string | null; equipment_id: string | null }>;
}) {
  const vesselName = (id?: string | null) => vessels.find(v => v.id === id)?.name;
  const equipLabel = (id?: string | null) => {
    const e = equipment.find(x => x.id === id);
    if (!e) return null;
    return [e.manufacturer, e.model, e.equipment_id].filter(Boolean).join(" ") || e.equipment_type;
  };
  return (
    <Card className="p-4 space-y-4 print:shadow-none print:border-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Prep sheet</h2>
          <p className="text-xs text-muted-foreground">
            {rev ? `Method revision v${rev.version}.${rev.revision}` : "No method"}
            {state.sampleId ? ` · Sample ${state.sampleId}` : ""}
            {state.lotNumber ? ` · Lot ${state.lotNumber}` : ""}
          </p>
        </div>
        {plan?.ok && (
          <div className="text-right text-xs">
            <div>Target: <span className="font-mono">{formatConcentration(plan.targetConcentrationMgPerMl)}</span> in {formatVolume(plan.finalVolumeUl)}</div>
            {plan.stockConcentrationMgPerMl && (
              <div>Stock: <span className="font-mono">{formatConcentration(plan.stockConcentrationMgPerMl)}</span></div>
            )}
            {plan.totalDilutionFactor != null && plan.totalDilutionFactor > 1 && (
              <div>Total dilution: {plan.totalDilutionFactor.toFixed(2)}×</div>
            )}
          </div>
        )}
      </div>

      {!rev && <p className="text-sm text-destructive">Pick a method revision first.</p>}
      {rev && !rules && <p className="text-sm text-destructive">This revision has no prep rules configured.</p>}
      {plan?.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertCircle className="size-4 mt-0.5 text-destructive" /> {plan.error}
        </div>
      )}
      {plan?.warnings && plan.warnings.length > 0 && (
        <ul className="text-xs space-y-1 rounded-md border border-yellow-500/40 bg-yellow-500/5 p-3">
          {plan.warnings.map((w, i) => (
            <li key={i} className="flex gap-2"><AlertCircle className="size-3.5 mt-0.5 text-yellow-500" />{w.message}</li>
          ))}
        </ul>
      )}

      {plan?.steps && plan.steps.length > 0 && (
        <ol className="space-y-2 text-sm">
          {plan.steps.map(s => (
            <li key={s.ordinal} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{s.ordinal}. {s.toLabel}</div>
                <Badge variant="outline" className="capitalize">{s.kind}</Badge>
              </div>
              <div className="text-sm mt-1">{s.instruction}</div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                {s.suggestedVesselId && <span>Vessel: {vesselName(s.suggestedVesselId) ?? "—"}</span>}
                {s.suggestedEquipmentId && <span>Pipette: {equipLabel(s.suggestedEquipmentId) ?? "—"}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {rules && (rules.mixing_instructions || rules.filtration_instructions || rules.sonication_instructions) && (
        <div className="text-xs border rounded-md p-3 space-y-1">
          <div className="font-medium">Method handling notes</div>
          {rules.mixing_instructions && <div>Mixing: {rules.mixing_instructions}</div>}
          {rules.sonication_instructions && <div>Sonication: {rules.sonication_instructions}</div>}
          {rules.centrifugation_instructions && <div>Centrifugation: {rules.centrifugation_instructions}</div>}
          {rules.filtration_instructions && <div>Filtration: {rules.filtration_instructions}</div>}
          {rules.storage_temp_c != null && <div>Storage: {rules.storage_temp_c} °C</div>}
        </div>
      )}

      {state.notes && (
        <div className="text-xs border rounded-md p-3">
          <div className="font-medium mb-1">Analyst notes</div>
          <div className="whitespace-pre-wrap">{state.notes}</div>
        </div>
      )}
    </Card>
  );
}

// ---------------- helpers ----------------

function validate(step: number, s: WizardState, rev: MethodRevision | null, rules: PrepRules | null): boolean {
  if (step === 0) return !!s.revisionId && !!rev;
  if (step === 1) {
    if (s.sourceForm === "lyophilized") return Number(s.availableMassMg) > 0;
    return Number(s.stockConcMgPerMl) > 0;
  }
  if (step === 2) return Number(s.targetConcMgPerMl) > 0 && Number(s.finalVolumeUl) > 0;
  if (step === 3) {
    if (!s.solventName.trim()) return false;
    if (s.sourceForm === "lyophilized") return Number(s.reconstitutionVolumeUl) > 0;
    return true;
  }
  return !!rules;
}

function normalizeToMgPerMl(value: number | null | undefined, unit: string | null | undefined): number | null {
  if (value == null) return null;
  const u = (unit ?? "mg/mL").toLowerCase().replace(/\s+/g, "");
  switch (u) {
    case "mg/ml": return value;
    case "µg/ml":
    case "ug/ml": return value / 1000;
    case "ng/ml": return value / 1_000_000;
    case "g/l": return value;
    case "mg/l": return value / 1000;
    default: return value; // best effort
  }
}
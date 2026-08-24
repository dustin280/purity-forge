import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepSource } from "./step-source";
import { StepDiluent } from "./step-diluent";
import { StepConcentration } from "./step-concentration";
import { StepReview } from "./step-review";
import { VerifyPrintDialog } from "./verify-print-dialog";
import { emptySolidState, toMgPerMl, type SolidFlowState } from "./types";
import { computePrep } from "./instructions";
import { createPrimaryStandardSolid } from "@/lib/standard-preparations.functions";
import { exportPrepPdf } from "@/lib/standard-preparation-pdf";
import { EXP_PRESETS } from "@/components/standard-preparations/prep-form-logic";

const STEP_TITLES = ["Source", "Diluent", "Concentration", "Review"];

interface Props {
  defaultAnalystName: string;
  userToken: string;
}

export function SolidFlow({ defaultAnalystName, userToken }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<SolidFlowState>(() => emptySolidState());
  const preparedAt = useMemo(() => new Date().toISOString(), []);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const create = useServerFn(createPrimaryStandardSolid);
  const mut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create({ data: payload as any }) as Promise<{ id: string; log_number: string }>,
    onSuccess: (res) => {
      setSavedNumber(res.log_number);
      setSavedId(res.id);
      toast.success(`Saved ${res.log_number}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const computed = useMemo(() => computePrep(state), [state]);

  const purity = state.source?.purity_percent ?? null;
  const canNext = (() => {
    if (step === 0) return !!state.source;
    if (step === 1) {
      const sum = state.diluent.reduce((s, x) => s + Number(x.percent || 0), 0);
      const hasNames = state.diluent.every(d => !d.name || (d.name && Number(d.percent) > 0));
      return Math.abs(sum - 100) < 0.01 && hasNames && state.diluent.some(d => d.name);
    }
    if (step === 2) return !!computed && !!state.concentration.standard_name.trim();
    return false;
  })();

  function handleVerify() {
    if (!state.source || !computed) return;
    const days = state.concentration.expiration_period_code === "custom"
      ? (Number(state.concentration.expiration_period_days) || null)
      : EXP_PRESETS[state.concentration.expiration_period_code].days;

    const payload = {
      prepared_at: preparedAt,
      analyst_name: defaultAnalystName,
      user_token: userToken,
      material_receipt_id: state.source.material_receipt_id,
      ref_material_name: state.source.material_name,
      ref_lot: state.source.lot || null,
      manufacturer_lot: state.source.lot || null,
      manufacturer: state.source.manufacturer || null,
      ref_purity_percent: state.source.purity_percent,
      ref_molecular_weight: state.source.molecular_weight,
      ref_receipt_date: state.source.received_at ? state.source.received_at.slice(0, 10) : null,
      diluent_solvents: state.diluent
        .filter(s => s.name && Number(s.percent) > 0)
        .map(s => ({
          name: s.name,
          percent: Number(s.percent),
          lot: s.lot || null,
          manufacturer: s.manufacturer || null,
          expiry_date: s.expiry_date || null,
          material_receipt_id: s.material_receipt_id,
        })),
      modifier_type: state.modifier.type.trim() || null,
      modifier_percent: state.modifier.type && state.modifier.percent ? Number(state.modifier.percent) : null,
      modifier_material_receipt_id: state.modifier.material_receipt_id,
      standard_name: state.concentration.standard_name.trim(),
      final_concentration_value: Number(state.concentration.final_concentration),
      final_concentration_unit: state.concentration.final_concentration_unit,
      final_volume_ml: Number(state.concentration.final_volume_ml),
      expiration_period_code: state.concentration.expiration_period_code,
      expiration_period_days: days,
      storage_condition: state.concentration.storage_condition || null,
      storage_location: state.concentration.storage_location || null,
      notes: state.concentration.notes || null,
      preparation_instructions: computed.instructions,
      calculated_mass_mg: computed.mass_mg,
      target_concentration_mg_per_ml: toMgPerMl(
        Number(state.concentration.final_concentration),
        state.concentration.final_concentration_unit,
      ),
    };
    mut.mutate(payload);
  }

  function handleSavePdf() {
    if (!state.source || !computed) return;
    const days = state.concentration.expiration_period_code === "custom"
      ? Number(state.concentration.expiration_period_days) || 0
      : EXP_PRESETS[state.concentration.expiration_period_code].days;
    const expDate = new Date(preparedAt);
    expDate.setDate(expDate.getDate() + days);
    // Cast a synthesized row to the StandardPrepRow shape jsPDF renderer expects.
    const solventSummary = state.diluent
      .filter(s => s.name && Number(s.percent) > 0)
      .map(s => `${s.percent}% ${s.name}`).join(" / ")
      + (state.modifier.type && state.modifier.percent ? ` + ${state.modifier.percent}% ${state.modifier.type}` : "");
    const row = {
      id: savedId ?? "",
      log_number: savedNumber ?? "",
      batch_group_id: null,
      prepared_at: preparedAt,
      analyst_id: null,
      analyst_name: defaultAnalystName,
      standard_name: state.concentration.standard_name,
      material_receipt_id: state.source.material_receipt_id,
      manufacturer_lot: state.source.lot,
      target_concentration: `${state.concentration.final_concentration} ${state.concentration.final_concentration_unit}`,
      final_volume: `${state.concentration.final_volume_ml} mL`,
      solvent: solventSummary,
      preparation_steps: [],
      mixing_details: null,
      appearance_notes: computed.instructions,
      expiration_date: expDate.toISOString().slice(0, 10),
      storage_condition: state.concentration.storage_condition,
      storage_location: state.concentration.storage_location,
      container_label: savedNumber,
      prep_type: "primary_solid",
      status: "approved" as const,
      reviewer_id: null, reviewer_name: defaultAnalystName, reviewed_at: new Date().toISOString(),
      approver_id: null, approver_name: defaultAnalystName, approved_at: new Date().toISOString(),
      notes: state.concentration.notes,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expiration_period_code: state.concentration.expiration_period_code,
      expiration_period_days: days,
      initial_solvent: null,
      final_diluent: solventSummary,
      modifier_percent: state.modifier.percent ? Number(state.modifier.percent) : null,
      material_overridden: false,
      ref_material_name: state.source.material_name,
      ref_lot: state.source.lot,
      ref_form: "solid" as const,
      ref_purity_percent: state.source.purity_percent,
      ref_concentration_mg_per_ml: null,
      ref_molecular_weight: state.source.molecular_weight,
      ref_receipt_date: state.source.received_at,
      final_volume_ml: Number(state.concentration.final_volume_ml),
      volume_remaining_ml: Number(state.concentration.final_volume_ml),
      lifecycle_status: "in_use",
    };
    exportPrepPdf(row, null, 0);
  }

  function handlePrint() {
    window.print();
  }

  function handleExit() {
    if (savedId) navigate({ to: "/lab-logs/standard-preparations/$id", params: { id: savedId } });
    else navigate({ to: "/lab-logs/standard-preparations" });
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 print:hidden">
        {STEP_TITLES.map((t, i) => (
          <div key={t} className="flex items-center gap-2">
            <div className={`size-7 rounded-full text-xs flex items-center justify-center border ${i === step ? "bg-primary text-primary-foreground border-primary" : i < step ? "bg-primary/20 border-primary/40" : "bg-muted"}`}>
              {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
            </div>
            <div className={`text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{t}</div>
            {i < STEP_TITLES.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <StepSource
          source={state.source}
          onChange={s => setState(prev => ({ ...prev, source: s }))}
          defaultReceiverName={defaultAnalystName}
        />
      )}
      {step === 1 && (
        <StepDiluent
          diluent={state.diluent}
          modifier={state.modifier}
          onDiluent={d => setState(prev => ({ ...prev, diluent: d }))}
          onModifier={m => setState(prev => ({ ...prev, modifier: m }))}
        />
      )}
      {step === 2 && (
        <StepConcentration
          value={state.concentration}
          onChange={c => setState(prev => ({ ...prev, concentration: c }))}
          calculatedMassMg={computed?.mass_mg ?? null}
          purityPercent={purity}
        />
      )}
      {step === 3 && computed && state.source && (
        <StepReview ref={reviewRef} state={state} computed={computed} preparedAt={preparedAt} analystName={defaultAnalystName} />
      )}
      {step === 3 && !computed && (
        <Card className="p-4 text-sm text-destructive">
          Missing or invalid inputs. Go back and complete all steps.
        </Card>
      )}

      <div className="flex items-center justify-between print:hidden">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext}>
            Next <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={handleVerify} disabled={!computed || mut.isPending || !!savedNumber}>
            {mut.isPending ? "Saving…" : savedNumber ? "Verified ✓" : "Verify & Save"}
          </Button>
        )}
      </div>

      <VerifyPrintDialog
        open={!!savedNumber}
        documentNumber={savedNumber}
        onSavePdf={handleSavePdf}
        onPrint={handlePrint}
        onExit={handleExit}
      />
    </div>
  );
}
